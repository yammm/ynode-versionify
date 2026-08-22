/**
 *  Node.js Fastify plugin to expose the version of the current web app via RESTful API call.
 *
 * @module @ynode/versionify
 */

/*
The MIT License (MIT)

Copyright (c) 2026 Michael Welter <me@mikinho.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import fp from "fastify-plugin";

const DEFAULT_PATH = "/version";
const DEFAULT_CACHE_MAX_AGE_SECONDS = 3600;

/**
 * Checks whether a value is a plain record suitable for public options.
 * @param {*} value - Candidate value.
 * @returns {boolean} Whether the value is a plain object.
 */
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

/**
 * Validates the package metadata used to build response representations.
 * @param {*} pkg - Candidate package metadata.
 * @returns {void}
 * @throws {TypeError} When the package metadata has an invalid shape.
 */
function validatePackage(pkg) {
    if (!isPlainObject(pkg)) {
        throw new TypeError("@ynode/versionify requires pkg to be a plain object");
    }
    if (pkg.name !== undefined && typeof pkg.name !== "string") {
        throw new TypeError("@ynode/versionify requires pkg.name to be a string when provided");
    }
    if (pkg.version !== undefined && typeof pkg.version !== "string") {
        throw new TypeError("@ynode/versionify requires pkg.version to be a string when provided");
    }
}

/**
 * Requires non-empty application identity fields for strict registrations.
 * Values are validated after the normal package shape checks and are not
 * trimmed or rewritten.
 *
 * @param {object} pkg - Validated package metadata.
 * @returns {void}
 * @throws {TypeError} When name or version is missing or empty.
 */
function validateRequiredPackageIdentity(pkg) {
    for (const key of ["name", "version"]) {
        if (typeof pkg[key] !== "string" || pkg[key].trim() === "") {
            throw new TypeError(
                `@ynode/versionify requires non-empty pkg.${key} when options.requireIdentity is true`,
            );
        }
    }
}

/**
 * Validates all supported plugin options at the registration boundary.
 * @param {*} options - Candidate plugin options.
 * @returns {void}
 * @throws {TypeError} When an option has an invalid shape or value.
 */
function validateOptions(options) {
    if (!isPlainObject(options)) {
        throw new TypeError("@ynode/versionify requires options to be a plain object");
    }
    if (
        options.path !== undefined &&
        (typeof options.path !== "string" || !options.path.startsWith("/"))
    ) {
        throw new TypeError(
            '@ynode/versionify requires options.path to be a string starting with "/"',
        );
    }
    if (
        options.prefix !== undefined &&
        (typeof options.prefix !== "string" || !options.prefix.startsWith("/"))
    ) {
        throw new TypeError(
            '@ynode/versionify requires options.prefix to be a string starting with "/"',
        );
    }
    if (options.rootDir !== undefined && typeof options.rootDir !== "string") {
        throw new TypeError("@ynode/versionify requires options.rootDir to be a string");
    }
    if (
        options.cacheMaxAge !== undefined &&
        (typeof options.cacheMaxAge !== "number" ||
            !Number.isFinite(options.cacheMaxAge) ||
            options.cacheMaxAge < 0)
    ) {
        throw new TypeError(
            "@ynode/versionify requires options.cacheMaxAge to be a non-negative finite number",
        );
    }
    if (options.etag !== undefined && typeof options.etag !== "boolean") {
        throw new TypeError("@ynode/versionify requires options.etag to be a boolean");
    }
    if (options.requireIdentity !== undefined && typeof options.requireIdentity !== "boolean") {
        throw new TypeError("@ynode/versionify requires options.requireIdentity to be a boolean");
    }
    for (const key of ["metadata", "build"]) {
        if (options[key] !== undefined && !isPlainObject(options[key])) {
            throw new TypeError(`@ynode/versionify requires options.${key} to be a plain object`);
        }
    }
    if (options.pkg !== undefined) {
        validatePackage(options.pkg);
    }
}

/**
 * Escapes HTML special characters to prevent injection in text content.
 * @param {string} str - Raw string to escape.
 * @returns {string} HTML-safe string.
 */
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * @typedef {object} VersionifyOptions
 * @property {string} [path="/version"] - The URL path to expose the version info.
 * @property {string} [prefix] - URL prefix prepended to `path`. Must start with "/".
 * @property {object} [pkg] - A package.json object. If not provided, it's loaded from the project root.
 * @property {string} [rootDir=process.cwd()] - Directory whose package.json is loaded when `pkg` is not provided.
 * @property {number} [cacheMaxAge=3600] - Cache-Control max-age in seconds. Set to 0 to disable.
 * @property {object.<string, *>} [metadata] - Additional static key-value pairs included in the JSON response. Keys `name`, `version`, and `build` are reserved and ignored.
 * @property {object.<string, *>} [build] - Additional build metadata nested under `build`.
 * @property {boolean} [etag=true] - Emit ETag and honor If-None-Match conditional requests.
 * @property {boolean} [requireIdentity=false] - Reject registration unless package name and version are non-empty strings.
 */

/**
 * Parses an Accept header without discarding explicit q=0 exclusions. Each
 * representation later selects its most-specific matching range before
 * candidates are compared by quality.
 * @param {string} header - Raw Accept header value.
 * @returns {Array<{mediaType: string, quality: number, specificity: number, order: number}>}
 */
function parseAcceptHeader(header) {
    if (header === undefined) {
        return [{ mediaType: "*/*", quality: 1, specificity: 0, order: 0 }];
    }
    if (typeof header !== "string" || header.trim() === "") {
        return [];
    }

    return header.split(",").map((entry, order) => {
        const parts = entry.trim().split(";");
        const mediaType = parts[0].trim().toLowerCase();
        let quality = 1;

        for (let i = 1; i < parts.length; ++i) {
            const param = parts[i].trim();
            const separator = param.indexOf("=");
            const name = separator === -1 ? param : param.slice(0, separator);
            if (name.trim().toLowerCase() === "q") {
                const rawQuality = separator === -1 ? "" : param.slice(separator + 1).trim();
                const parsed = Number(rawQuality);
                quality =
                    rawQuality !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
                        ? parsed
                        : 0;
                break;
            }
        }

        const [mainType, subtype, extra] = mediaType.split("/");
        const specificity =
            extra !== undefined || !mainType || !subtype || (mainType === "*" && subtype !== "*")
                ? -1
                : mainType === "*"
                  ? 0
                  : subtype === "*"
                    ? 1
                    : 2;

        return { mediaType, quality, specificity, order };
    });
}

/**
 * Checks whether an accepted media range allows a concrete response type.
 * Supports exact matches plus type and subtype wildcards.
 * @param {string} acceptedType - Media range from the Accept header.
 * @param {string} responseType - Concrete response Content-Type.
 * @returns {boolean} True when the response type satisfies the media range.
 */
function acceptsMediaType(acceptedType, responseType) {
    const [acceptedMainType, acceptedSubtype] = acceptedType.split("/");
    const [responseMainType, responseSubtype] = responseType.split("/");

    if (
        !acceptedMainType ||
        !acceptedSubtype ||
        !responseMainType ||
        !responseSubtype ||
        (acceptedMainType === "*" && acceptedSubtype !== "*")
    ) {
        return false;
    }

    return (
        (acceptedMainType === "*" || acceptedMainType === responseMainType) &&
        (acceptedSubtype === "*" || acceptedSubtype === responseSubtype)
    );
}

/**
 * Finds the quality assigned to one representation by its most-specific range.
 * @param {Array<{mediaType: string, quality: number, specificity: number, order: number}>} acceptedRanges - Parsed Accept ranges.
 * @param {string} responseType - Concrete representation media type.
 * @returns {number} Effective quality, or zero when the type is unacceptable.
 */
function qualityForMediaType(acceptedRanges, responseType) {
    let selected = null;

    for (const range of acceptedRanges) {
        if (range.specificity < 0 || !acceptsMediaType(range.mediaType, responseType)) {
            continue;
        }
        if (
            selected === null ||
            range.specificity > selected.specificity ||
            (range.specificity === selected.specificity && range.quality > selected.quality) ||
            (range.specificity === selected.specificity &&
                range.quality === selected.quality &&
                range.order < selected.order)
        ) {
            selected = range;
        }
    }

    return selected?.quality ?? 0;
}

/**
 * Selects the highest-quality response, retaining server order for ties.
 * @param {Array<{mediaType: string, quality: number, specificity: number, order: number}>} acceptedRanges - Parsed Accept ranges.
 * @param {Array<{mediaType: string}>} representations - Supported representations.
 * @returns {object|null} Selected representation, or null for a 406 response.
 */
function selectRepresentation(acceptedRanges, representations) {
    let selected = null;
    let selectedQuality = 0;

    for (const representation of representations) {
        const quality = qualityForMediaType(acceptedRanges, representation.mediaType);
        if (quality > selectedQuality) {
            selected = representation;
            selectedQuality = quality;
        }
    }

    return selected;
}

/**
 * Converts static metadata to JSON-safe values without throwing on Dates,
 * BigInts, circular references, or unsupported JavaScript values.
 * @param {*} value - Candidate metadata value.
 * @param {WeakSet<object>} [seen] - Object references already visited.
 * @returns {*} JSON-safe value, or undefined when the value should be skipped.
 */
function toJsonMetadataValue(value, seen = new WeakSet()) {
    if (value === undefined || typeof value === "function" || typeof value === "symbol") {
        return undefined;
    }
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) {
            return "[Circular]";
        }
        seen.add(value);
        const copy = value
            .map((entry) => toJsonMetadataValue(entry, seen))
            .filter((entry) => entry !== undefined);
        seen.delete(value);
        return copy;
    }
    if (value && typeof value === "object") {
        if (seen.has(value)) {
            return "[Circular]";
        }
        seen.add(value);
        const copy = {};
        for (const [key, entry] of Object.entries(value)) {
            const jsonValue = toJsonMetadataValue(entry, seen);
            if (jsonValue !== undefined) {
                copy[key] = jsonValue;
            }
        }
        seen.delete(value);
        return copy;
    }
    return value;
}

/**
 * Returns a JSON-safe metadata object or null when no fields survive.
 * @param {object} metadata - Candidate metadata object.
 * @returns {object|null}
 */
function normalizeMetadataObject(metadata) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }
    const normalized = toJsonMetadataValue(metadata);
    return normalized &&
        typeof normalized === "object" &&
        !Array.isArray(normalized) &&
        Object.keys(normalized).length > 0
        ? normalized
        : null;
}

/**
 * Creates a weak ETag over one rendered response representation, so every
 * negotiated content type carries its own validator.
 * @param {string} body - Rendered response body.
 * @returns {string}
 */
function buildEntityTag(body) {
    const hash = createHash("sha256").update(body).digest("hex");
    return `W/"${hash}"`;
}

/**
 * Tests whether an If-None-Match header matches the current ETag.
 * @param {string|string[]|undefined} header - Raw request header.
 * @param {string} entityTag - Current response ETag.
 * @returns {boolean}
 */
function ifNoneMatchMatches(header, entityTag) {
    if (!header) {
        return false;
    }

    const values = Array.isArray(header) ? header : [header];
    const current = entityTag.replace(/^W\//, "");
    return values.some((value) =>
        String(value)
            .split(",")
            .some((candidate) => {
                const tag = candidate.trim();
                return tag === "*" || tag.replace(/^W\//, "") === current;
            }),
    );
}

/**
 * Content-type negotiation map in server-preference order for equal quality.
 */
const CONTENT_HANDLERS = [
    {
        mediaType: "application/json",
        contentType: "application/json; charset=utf-8",
        renderBody: (payload) => JSON.stringify(payload.json),
    },
    {
        mediaType: "text/html",
        contentType: "text/html; charset=utf-8",
        renderBody: (payload) =>
            `<b>${escapeHtml(payload.name)}</b> v<em>${escapeHtml(payload.version)}</em>`,
    },
    {
        mediaType: "text/plain",
        contentType: "text/plain; charset=utf-8",
        renderBody: (payload) => `${payload.name} v${payload.version}`,
    },
];

/**
 * Renders every negotiable representation once at registration time, pairing
 * each rendered body with its own entity tag.
 * @param {{ name: string, version: string, json: object }} payload - Payload bundle.
 * @param {boolean} etagEnabled - Whether entity tags should be generated.
 * @returns {Array<{mediaType: string, contentType: string, body: string, entityTag: string|null}>}
 */
function buildRepresentations(payload, etagEnabled) {
    return CONTENT_HANDLERS.map((handler) => {
        const body = handler.renderBody(payload);
        return {
            mediaType: handler.mediaType,
            contentType: handler.contentType,
            body,
            entityTag: etagEnabled ? buildEntityTag(body) : null,
        };
    });
}

/**
 * Builds the static JSON response payload once at registration time.
 * Includes name, version, and any configured metadata fields.
 * @param {object} pkg - Parsed package.json.
 * @param {object} [metadata] - Additional metadata key-value pairs.
 * @param {object} [build] - Additional build metadata.
 * @returns {{ name: string, version: string, json: object }} Payload bundle.
 */
function buildPayload(pkg, metadata, build) {
    const name = pkg.name ?? "unknown";
    const version = pkg.version ?? "0.0.0";
    const json = { name, version };

    const normalizedMetadata = normalizeMetadataObject(metadata);
    if (normalizedMetadata) {
        for (const [key, value] of Object.entries(normalizedMetadata)) {
            // `build` is reserved for the dedicated option below so a metadata
            // copy can neither clobber it nor leak through as a top-level key.
            if (key === "name" || key === "version" || key === "build") {
                continue;
            }
            json[key] = value;
        }
    }

    const buildMetadata = normalizeMetadataObject(build);
    if (buildMetadata) {
        json.build = buildMetadata;
    }

    return { name, version, json };
}

/**
 * Builds the Cache-Control header value from the configured max-age.
 * @param {number} maxAge - Max-age in seconds.
 * @returns {string|null} Header value, or null to skip the header.
 */
function buildCacheControlHeader(maxAge) {
    if (!Number.isFinite(maxAge) || maxAge <= 0) {
        return null;
    }
    return `public, max-age=${Math.floor(maxAge)}`;
}

/**
 * The main versionify plugin.
 * @async
 * @param {object} fastify - The Fastify instance.
 * @param {VersionifyOptions} [options] - Optional configuration object.
 * @example
 * // Register the plugin with default options
 * await fastify.register(versionify, { prefix: "/~" });
 *
 * // Register with structured metadata and cache control
 * await fastify.register(versionify, {
 *     path: "/info",
 *     metadata: { environment: "production", nodeVersion: process.version },
 *     build: { commit: process.env.GIT_SHA, time: process.env.BUILD_TIME },
 *     cacheMaxAge: 7200,
 * });
 */
export default fp(
    async function versionify(fastify, options = {}) {
        validateOptions(options);

        if (fastify.hasDecorator("versionify")) {
            throw new Error("@ynode/versionify has already been registered");
        }

        const log = fastify.log.child({ name: "@ynode/versionify" });

        let pkg = options.pkg ?? fastify.pkg;

        // If pkg is not provided, try to load it from the project's package.json
        if (!pkg) {
            const rootDir = options.rootDir ?? process.cwd();
            const packagePath = resolve(rootDir, "package.json");
            try {
                const pkgContents = await readFile(packagePath, "utf8");
                pkg = JSON.parse(pkgContents);
            } catch (error) {
                if (options.requireIdentity) {
                    const identityError = new Error(
                        `@ynode/versionify could not load required package identity from ${packagePath}`,
                        { cause: error },
                    );
                    identityError.code = "ERR_VERSIONIFY_IDENTITY_LOAD";
                    throw identityError;
                }
                log.error({ err: error }, "Could not load package.json, using fallback defaults");
                pkg = { name: "unknown", version: "0.0.0" };
            }
        }
        validatePackage(pkg);
        if (options.requireIdentity) {
            validateRequiredPackageIdentity(pkg);
        }

        // fastify-plugin's skip-override discards Fastify's own register-time
        // prefixing, so the prefix is applied to the route path directly.
        const prefix = (options.prefix ?? "").replace(/\/+$/, "");
        const routePath = `${prefix}${options.path ?? DEFAULT_PATH}`;
        const cacheMaxAge = options.cacheMaxAge ?? DEFAULT_CACHE_MAX_AGE_SECONDS;

        const payload = buildPayload(pkg, options.metadata, options.build);
        const cacheControl = buildCacheControlHeader(cacheMaxAge);
        const representations = buildRepresentations(payload, options.etag !== false);

        fastify.get(routePath, (req, reply) => {
            const accepted = parseAcceptHeader(req.headers.accept);
            // Every outcome varies on Accept, including 406. This keeps the
            // negotiation key explicit if an upstream cache is configured to
            // store error responses.
            reply.header("Vary", "Accept");
            const representation = selectRepresentation(accepted, representations);
            if (!representation) {
                return reply.status(406).send("Not Acceptable");
            }

            // Caching headers are set only after successful negotiation, so a
            // 406 carries neither Cache-Control nor ETag.
            if (cacheControl) {
                reply.header("Cache-Control", cacheControl);
            }
            if (representation.entityTag) {
                reply.header("ETag", representation.entityTag);
                if (ifNoneMatchMatches(req.headers["if-none-match"], representation.entityTag)) {
                    return reply.status(304).send();
                }
            }

            return reply
                .header("Content-Type", representation.contentType)
                .status(200)
                .send(representation.body);
        });

        fastify.decorate("versionify", true);
    },
    {
        fastify: "5.x",
        name: "@ynode/versionify",
    },
);
