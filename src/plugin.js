/**
 *  Node.js Fastify plugin to expose the version of the current web app via RESTful API call.
 *
 * @module @ynode/versionify
 */

/*
The MIT License (MIT)

Copyright (c) 2025 Michael Welter <me@mikinho.com>

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
 */

/**
 * Parses an RFC 7231 Accept header into a priority-ordered list of media types.
 * Entries are sorted by quality parameter (q) descending, then by specificity.
 * @param {string} header - Raw Accept header value.
 * @returns {string[]} Media types sorted by negotiation priority.
 */
function parseAcceptHeader(header) {
    if (!header || typeof header !== "string") {
        return ["*/*"];
    }

    const entries = header.split(",").map((entry) => {
        const parts = entry.trim().split(";");
        const mediaType = parts[0].trim().toLowerCase();
        let quality = 1.0;

        for (let i = 1; i < parts.length; ++i) {
            const param = parts[i].trim();
            if (param.startsWith("q=")) {
                const parsed = parseFloat(param.slice(2));
                if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
                    quality = parsed;
                }
                break;
            }
        }

        return { mediaType, quality };
    });

    entries.sort((a, b) => {
        if (b.quality !== a.quality) {
            return b.quality - a.quality;
        }
        // More specific types rank higher (e.g. text/html > text/* > */*)
        const aWild = (a.mediaType.match(/\*/g) ?? []).length;
        const bWild = (b.mediaType.match(/\*/g) ?? []).length;
        return aWild - bWild;
    });

    return entries.filter((e) => e.quality > 0).map((e) => e.mediaType);
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

    if (!acceptedMainType || !acceptedSubtype || !responseMainType || !responseSubtype) {
        return false;
    }

    return (
        (acceptedMainType === "*" || acceptedMainType === responseMainType) &&
        (acceptedSubtype === "*" || acceptedSubtype === responseSubtype)
    );
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
        return value.toISOString();
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => toJsonMetadataValue(entry, seen))
            .filter((entry) => entry !== undefined);
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
 * Content-type negotiation map. Each entry defines a media type pattern
 * and how to render the version response body for that type.
 * Checked in caller order against the priority-sorted Accept list.
 */
const CONTENT_HANDLERS = [
    {
        contentType: "application/json",
        matches: (media) => acceptsMediaType(media, "application/json"),
        renderBody: (payload) => JSON.stringify(payload.json),
    },
    {
        contentType: "text/html",
        matches: (media) => acceptsMediaType(media, "text/html"),
        renderBody: (payload) =>
            `<b>${escapeHtml(payload.name)}</b> v<em>${escapeHtml(payload.version)}</em>`,
    },
    {
        contentType: "text/plain",
        matches: (media) => acceptsMediaType(media, "text/plain"),
        renderBody: (payload) => `${payload.name} v${payload.version}`,
    },
    {
        contentType: "application/json",
        matches: (media) => media === "*/*",
        renderBody: (payload) => JSON.stringify(payload.json),
    },
];

/**
 * Renders every negotiable representation once at registration time, pairing
 * each rendered body with its own entity tag.
 * @param {{ name: string, version: string, json: object }} payload - Payload bundle.
 * @param {boolean} etagEnabled - Whether entity tags should be generated.
 * @returns {Array<{ matches: function(string): boolean, contentType: string, body: string, entityTag: string|null }>}
 */
function buildRepresentations(payload, etagEnabled) {
    return CONTENT_HANDLERS.map((handler) => {
        const body = handler.renderBody(payload);
        return {
            matches: handler.matches,
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
        if (typeof fastify.hasDecorator === "function" && fastify.hasDecorator("versionify")) {
            throw new Error("@ynode/versionify has already been registered");
        }

        const log = fastify.log.child({ name: "@ynode/versionify" });

        if (options.rootDir !== undefined && typeof options.rootDir !== "string") {
            throw new TypeError("@ynode/versionify requires options.rootDir to be a string");
        }

        let pkg = options.pkg ?? fastify.pkg;

        // If pkg is not provided, try to load it from the project's package.json
        if (!pkg) {
            try {
                const rootDir = options.rootDir ?? process.cwd();
                const pkgContents = await readFile(resolve(rootDir, "package.json"), "utf8");
                pkg = JSON.parse(pkgContents);
            } catch (error) {
                log.error({ err: error }, "Could not load package.json, using fallback defaults");
                pkg = { name: "unknown", version: "0.0.0" };
            }
        }

        if (
            options.prefix !== undefined &&
            (typeof options.prefix !== "string" || !options.prefix.startsWith("/"))
        ) {
            throw new TypeError(
                '@ynode/versionify requires options.prefix to be a string starting with "/"',
            );
        }

        // fastify-plugin's skip-override discards Fastify's own register-time
        // prefixing, so the prefix is applied to the route path directly.
        const prefix = (options.prefix ?? "").replace(/\/+$/, "");
        const routePath = `${prefix}${options.path ?? DEFAULT_PATH}`;
        const cacheMaxAge = options.cacheMaxAge ?? DEFAULT_CACHE_MAX_AGE_SECONDS;
        if (typeof cacheMaxAge !== "number" || !Number.isFinite(cacheMaxAge) || cacheMaxAge < 0) {
            throw new TypeError(
                "@ynode/versionify requires options.cacheMaxAge to be a non-negative finite number",
            );
        }

        const payload = buildPayload(pkg, options.metadata, options.build);
        const cacheControl = buildCacheControlHeader(cacheMaxAge);
        const representations = buildRepresentations(payload, options.etag !== false);

        fastify.get(routePath, (req, reply) => {
            const accepted = parseAcceptHeader(req.headers.accept);

            for (const media of accepted) {
                for (const representation of representations) {
                    if (!representation.matches(media)) {
                        continue;
                    }

                    // Caching headers are set only after successful negotiation,
                    // so a 406 carries neither Cache-Control nor ETag. Vary tells
                    // shared caches each Accept value is its own cache entry.
                    reply.header("Vary", "Accept");
                    if (cacheControl) {
                        reply.header("Cache-Control", cacheControl);
                    }
                    if (representation.entityTag) {
                        reply.header("ETag", representation.entityTag);
                        if (
                            ifNoneMatchMatches(
                                req.headers["if-none-match"],
                                representation.entityTag,
                            )
                        ) {
                            return reply.status(304).send();
                        }
                    }

                    return reply
                        .header("Content-Type", representation.contentType)
                        .status(200)
                        .send(representation.body);
                }
            }

            return reply.status(406).send("Not Acceptable");
        });

        fastify.decorate("versionify", true);
    },
    {
        fastify: "5.x",
        name: "@ynode/versionify",
    },
);
