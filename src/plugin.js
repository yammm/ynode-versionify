/**
 *  Node.js Fastity plugin to expose the version of the current web app via RESTful API call.
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

import { resolve } from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import fp from "fastify-plugin";

/**
 * The main versionify plugin.
 * @async
 * @param {object} fastify - The Fastify instance.
 * @param {object} [options] - Optional configuration object.
 * @param {string} [options.path="/version"] - The URL path to expose the version info.
 * @param {string} [options.prefix] - The URL prefix to expose the version info.
 * @param {object} [options.pkg] - A package.json object. If not provided, it's loaded from the project root.
 * @example
 * // Register the plugin with default options
 * await fastify.register(versionify, { prefix: "/~" });
 *
 * // Register with a custom path
 * await fastify.register(versionify, { path: "/info" });
 */
export default fp(async function versionify(fastify, options = {}) {
    const defaultOptions = {
        path: "/version",
    };

    let pkg = options.pkg ?? fastify.pkg;

    // If pkg is not provided, try to load it from the project's package.json
    if (!pkg) {
        try {
            const pkgContents = await readFile(resolve(process.cwd(), "package.json"), "utf8");
            pkg = JSON.parse(pkgContents);
        } catch (err) {
            fastify.log.error("versionify: Could not load package.json.", err);
            // Assign default values to prevent crashes if the file is missing
            pkg = { name: "unknown", version: "0.0.0" };
        }
    }

    const finalOptions = { ...defaultOptions, ...options };

    fastify.get(finalOptions.path, async (req, reply) => {
        const accept = req.headers.accept;

        if (accept.includes("application/json")) {
            return await reply
                .header("Content-Type", "application/json")
                .status(200)
                .send({ name: pkg.name, version: pkg.version });
        }

        if (accept.includes("text/html")) {
            return await reply
                .header("Content-Type", "text/html")
                .send(`<b>${pkg.name}</b> v<em>${pkg.version}</em>`);
        }

        if (accept.includes("text/plain")) {
            return await reply
                .header("Content-Type", "text/plain")
                .send(`${pkg.name} v${pkg.version}`);
        }

        if (accept.includes("*/*")) {
            return await reply
                .header("Content-Type", "application/json")
                .status(200)
                .send({ name: pkg.name, version: pkg.version });
        }

        return await reply.status(406).send("Not Acceptable");
    });
}, {
    fastify: "5.x",
    name: "@ynode/versionify",
});
