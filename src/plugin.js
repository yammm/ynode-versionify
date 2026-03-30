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
 * @property {string} [prefix] - The URL prefix to expose the version info.
 * @property {object} [pkg] - A package.json object. If not provided, it's loaded from the project root.
 * @property {number} [cacheMaxAge=3600] - Cache-Control max-age in seconds. Set to 0 to disable.
 * @property {Object<string, string|number|boolean>} [metadata] - Additional static key-value pairs included in the JSON response.
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
 * Content-type negotiation map. Each entry defines a media type pattern
 * and how to render the version response for that type.
 * Checked in caller order against the priority-sorted Accept list.
 */
const CONTENT_HANDLERS = [
    {
        type: "application/json",
        matches: (media) => media === "application/json",
        render: (payload, reply) =>
            reply.header("Content-Type", "application/json").status(200).send(payload.json),
    },
    {
        type: "text/html",
        matches: (media) => media === "text/html",
        render: (payload, reply) =>
            reply
                .header("Content-Type", "text/html")
                .status(200)
                .send(
                    `<b>${escapeHtml(payload.name)}</b> v<em>${escapeHtml(payload.version)}</em>`,
                ),
    },
    {
        type: "text/plain",
        matches: (media) => media === "text/plain",
        render: (payload, reply) =>
            reply
                .header("Content-Type", "text/plain")
                .status(200)
                .send(`${payload.name} v${payload.version}`),
    },
    {
        type: "*/*",
        matches: (media) => media === "*/*",
        render: (payload, reply) =>
            reply.header("Content-Type", "application/json").status(200).send(payload.json),
    },
];

/**
 * Builds the static JSON response payload once at registration time.
 * Includes name, version, and any configured metadata fields.
 * @param {object} pkg - Parsed package.json.
 * @param {object} [metadata] - Additional metadata key-value pairs.
 * @returns {{ name: string, version: string, json: object }} Payload bundle.
 */
function buildPayload(pkg, metadata) {
    const name = pkg.name ?? "unknown";
    const version = pkg.version ?? "0.0.0";
    const json = { name, version };

    if (metadata && typeof metadata === "object") {
        for (const [key, value] of Object.entries(metadata)) {
            if (key === "name" || key === "version") {
                continue;
            }
            json[key] = value;
        }
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
 *     cacheMaxAge: 7200,
 * });
 */
export default fp(
    async function versionify(fastify, options = {}) {
        if (typeof fastify.hasDecorator === "function" && fastify.hasDecorator("versionify")) {
            throw new Error("@ynode/versionify has already been registered");
        }

        const log = fastify.log.child({ name: "@ynode/versionify" });

        let pkg = options.pkg ?? fastify.pkg;

        // If pkg is not provided, try to load it from the project's package.json
        if (!pkg) {
            try {
                const pkgContents = await readFile(resolve(process.cwd(), "package.json"), "utf8");
                pkg = JSON.parse(pkgContents);
            } catch (error) {
                log.error({ err: error }, "Could not load package.json, using fallback defaults");
                pkg = { name: "unknown", version: "0.0.0" };
            }
        }

        const routePath = options.path ?? DEFAULT_PATH;
        const payload = buildPayload(pkg, options.metadata);
        const cacheControl = buildCacheControlHeader(
            options.cacheMaxAge ?? DEFAULT_CACHE_MAX_AGE_SECONDS,
        );

        fastify.get(routePath, (req, reply) => {
            if (cacheControl) {
                reply.header("Cache-Control", cacheControl);
            }

            const accepted = parseAcceptHeader(req.headers.accept);

            for (const media of accepted) {
                for (const handler of CONTENT_HANDLERS) {
                    if (!handler.matches(media)) {
                        continue;
                    }
                    return handler.render(payload, reply);
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
