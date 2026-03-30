import assert from "node:assert/strict";
import { describe, test } from "node:test";

import Fastify from "fastify";

import versionify from "../src/plugin.js";

const TEST_PKG = { name: "test-app", version: "1.2.3" };

describe("content negotiation", () => {
    test("responds with JSON for Accept: application/json", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { name: "test-app", version: "1.2.3" });
        assert.match(res.headers["content-type"], /^application\/json/);
    });

    test("responds with HTML for Accept: text/html", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/html" },
        });

        assert.equal(res.statusCode, 200);
        assert.match(res.payload, /<b>test-app<\/b> v<em>1\.2\.3<\/em>/);
        assert.equal(res.headers["content-type"], "text/html");
    });

    test("responds with plain text for Accept: text/plain", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/plain" },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.payload, "test-app v1.2.3");
        assert.equal(res.headers["content-type"], "text/plain");
    });

    test("responds with JSON for Accept: */*", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "*/*" },
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { name: "test-app", version: "1.2.3" });
    });

    test("responds with JSON when no Accept header is present", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: {},
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { name: "test-app", version: "1.2.3" });
    });

    test("returns 406 for unsupported Accept type without wildcard", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "image/png" },
        });

        assert.equal(res.statusCode, 406);
    });
});

describe("RFC 7231 quality parameters", () => {
    test("prefers higher quality type", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/plain;q=0.5, application/json;q=0.9" },
        });

        assert.equal(res.statusCode, 200);
        assert.match(res.headers["content-type"], /^application\/json/);
    });

    test("falls back to lower quality when higher is unsupported", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "image/png;q=1.0, text/plain;q=0.8" },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["content-type"], "text/plain");
    });

    test("rejects q=0 entries", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json;q=0, text/html;q=0" },
        });

        assert.equal(res.statusCode, 406);
    });
});

describe("structured metadata", () => {
    test("includes metadata fields in JSON response", async () => {
        const app = Fastify();
        await app.register(versionify, {
            pkg: TEST_PKG,
            metadata: { environment: "staging", nodeVersion: "v22.0.0", buildId: 42 },
        });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.name, "test-app");
        assert.equal(body.version, "1.2.3");
        assert.equal(body.environment, "staging");
        assert.equal(body.nodeVersion, "v22.0.0");
        assert.equal(body.buildId, 42);
    });

    test("metadata cannot override name or version", async () => {
        const app = Fastify();
        await app.register(versionify, {
            pkg: TEST_PKG,
            metadata: { name: "evil", version: "9.9.9", extra: true },
        });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        const body = res.json();
        assert.equal(body.name, "test-app");
        assert.equal(body.version, "1.2.3");
        assert.equal(body.extra, true);
    });
});

describe("cache control headers", () => {
    test("sets Cache-Control with default 1 hour max-age", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.headers["cache-control"], "public, max-age=3600");
    });

    test("supports custom cacheMaxAge", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG, cacheMaxAge: 120 });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.headers["cache-control"], "public, max-age=120");
    });

    test("omits Cache-Control when cacheMaxAge is 0", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG, cacheMaxAge: 0 });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.headers["cache-control"], undefined);
    });
});

describe("plugin options", () => {
    test("supports custom path", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG, path: "/info" });

        const res = await app.inject({
            method: "GET",
            url: "/info",
            headers: { accept: "application/json" },
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { name: "test-app", version: "1.2.3" });
    });

    test("rejects duplicate registration", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        await assert.rejects(async () => {
            await app.register(versionify, { pkg: TEST_PKG });
        }, /has already been registered/);
    });

    test("falls back to unknown/0.0.0 when pkg is missing and package.json is unreadable", async () => {
        const app = Fastify();
        // Force a missing pkg by using a cwd that won't have a package.json
        const originalCwd = process.cwd;
        process.cwd = () => "/nonexistent-path-for-test";

        try {
            await app.register(versionify);
            const res = await app.inject({
                method: "GET",
                url: "/version",
                headers: { accept: "application/json" },
            });

            assert.equal(res.statusCode, 200);
            assert.deepEqual(res.json(), { name: "unknown", version: "0.0.0" });
        } finally {
            process.cwd = originalCwd;
        }
    });
});
