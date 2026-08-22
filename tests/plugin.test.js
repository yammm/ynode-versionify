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
        assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
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
        assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
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

    test("responds with JSON for Accept: application/*", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/*" },
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { name: "test-app", version: "1.2.3" });
        assert.match(res.headers["content-type"], /^application\/json/);
    });

    test("responds with HTML for Accept: text/*", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/*" },
        });

        assert.equal(res.statusCode, 200);
        assert.match(res.payload, /<b>test-app<\/b> v<em>1\.2\.3<\/em>/);
        assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
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

    test("returns 406 for an explicitly empty Accept header", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "" },
        });

        assert.equal(res.statusCode, 406);
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

describe("HTTP Accept quality parameters", () => {
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
        assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
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

    test("honors a specific HTML exclusion over a text wildcard", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/*;q=0.5, text/html;q=0" },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
    });

    test("honors a specific JSON exclusion over an application wildcard", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/*;q=0.8, application/json;q=0" },
        });

        assert.equal(res.statusCode, 406);
    });

    test("treats quality parameter names case-insensitively", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/html;Q=0, text/plain;q=0.4" },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
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

    test("reserves the build key for the build option", async () => {
        const app = Fastify();
        await app.register(versionify, {
            pkg: TEST_PKG,
            metadata: { build: { commit: "smuggled" }, extra: true },
            build: { commit: "abc123" },
        });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        const body = res.json();
        assert.deepEqual(body.build, { commit: "abc123" });
        assert.equal(body.extra, true);
    });

    test("drops a metadata build key even without the build option", async () => {
        const app = Fastify();
        await app.register(versionify, {
            pkg: TEST_PKG,
            metadata: { build: { commit: "smuggled" } },
        });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.deepEqual(res.json(), { name: "test-app", version: "1.2.3" });
    });

    test("includes normalized build metadata under build", async () => {
        const app = Fastify();
        const circular = { commit: "abc123" };
        circular.self = circular;
        await app.register(versionify, {
            pkg: TEST_PKG,
            build: {
                commit: "abc123",
                time: new Date("2026-07-21T12:34:56.000Z"),
                sequence: 7n,
                circular,
            },
        });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        const body = res.json();
        assert.deepEqual(body.build, {
            commit: "abc123",
            time: "2026-07-21T12:34:56.000Z",
            sequence: "7",
            circular: {
                commit: "abc123",
                self: "[Circular]",
            },
        });
    });

    test("normalizes circular arrays and invalid Dates without throwing", async () => {
        const app = Fastify();
        const circular = [];
        circular.push(circular);

        await app.register(versionify, {
            pkg: TEST_PKG,
            build: {
                circular,
                invalidDate: new Date("invalid"),
            },
        });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json().build, {
            circular: ["[Circular]"],
            invalidDate: null,
        });
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

    test("rejects a non-numeric cacheMaxAge at registration", async () => {
        const app = Fastify();

        await assert.rejects(async () => {
            await app.register(versionify, { pkg: TEST_PKG, cacheMaxAge: "3600" });
        }, TypeError);
    });

    test("rejects a negative cacheMaxAge at registration", async () => {
        const app = Fastify();

        await assert.rejects(async () => {
            await app.register(versionify, { pkg: TEST_PKG, cacheMaxAge: -1 });
        }, /options\.cacheMaxAge to be a non-negative finite number/);
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

describe("conditional requests", () => {
    test("sets ETag and returns 304 for matching If-None-Match", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const first = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });
        const etag = first.headers.etag;

        assert.equal(first.statusCode, 200);
        assert.match(etag, /^W\/"[a-f0-9]{64}"$/);

        const second = await app.inject({
            method: "GET",
            url: "/version",
            headers: {
                accept: "application/json",
                "if-none-match": etag,
            },
        });

        assert.equal(second.statusCode, 304);
        assert.equal(second.payload, "");
        assert.equal(second.headers.etag, etag);
    });

    test("supports If-None-Match lists and strong/weak comparison", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const first = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });
        const strongTag = String(first.headers.etag).replace(/^W\//, "");

        const second = await app.inject({
            method: "GET",
            url: "/version",
            headers: {
                accept: "application/json",
                "if-none-match": `"stale", ${strongTag}`,
            },
        });

        assert.equal(second.statusCode, 304);
    });

    test("issues a distinct ETag per representation and ignores cross-representation validators", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const json = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });
        const plain = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/plain" },
        });

        assert.equal(json.statusCode, 200);
        assert.equal(plain.statusCode, 200);
        assert.notEqual(json.headers.etag, plain.headers.etag);

        // A validator from the JSON representation must not shortcut the
        // plain-text representation to 304.
        const crossed = await app.inject({
            method: "GET",
            url: "/version",
            headers: {
                accept: "text/plain",
                "if-none-match": json.headers.etag,
            },
        });

        assert.equal(crossed.statusCode, 200);
        assert.equal(crossed.payload, "test-app v1.2.3");
        assert.equal(crossed.headers.etag, plain.headers.etag);
    });

    test("sends Vary: Accept on negotiated responses", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const ok = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/html" },
        });
        const notModified = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "text/html", "if-none-match": ok.headers.etag },
        });

        assert.equal(ok.statusCode, 200);
        assert.equal(ok.headers.vary, "Accept");
        assert.equal(notModified.statusCode, 304);
        assert.equal(notModified.headers.vary, "Accept");
    });

    test("omits caching headers on 406 responses", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "image/png" },
        });

        assert.equal(res.statusCode, 406);
        assert.equal(res.headers.vary, "Accept");
        assert.equal(res.headers["cache-control"], undefined);
        assert.equal(res.headers.etag, undefined);
    });

    test("omits ETag and conditional handling when etag is false", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG, etag: false });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: {
                accept: "application/json",
                "if-none-match": "*",
            },
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers.etag, undefined);
        assert.deepEqual(res.json(), { name: "test-app", version: "1.2.3" });
    });

    test("keeps unsupported Accept responses as 406 even with matching validators", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const first = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });
        const second = await app.inject({
            method: "GET",
            url: "/version",
            headers: {
                accept: "image/png",
                "if-none-match": first.headers.etag,
            },
        });

        assert.equal(second.statusCode, 406);
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

    test("serves the route under a prefix", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG, prefix: "/~" });

        const prefixed = await app.inject({
            method: "GET",
            url: "/~/version",
            headers: { accept: "application/json" },
        });
        const unprefixed = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(prefixed.statusCode, 200);
        assert.deepEqual(prefixed.json(), { name: "test-app", version: "1.2.3" });
        assert.equal(unprefixed.statusCode, 404);
    });

    test("serves the default path when no prefix is given", async () => {
        const app = Fastify();
        await app.register(versionify, { pkg: TEST_PKG });

        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.statusCode, 200);
    });

    test("rejects a prefix that does not start with a slash", async () => {
        const app = Fastify();

        await assert.rejects(async () => {
            await app.register(versionify, { pkg: TEST_PKG, prefix: "~" });
        }, /options\.prefix to be a string starting with "\/"/);
    });

    test("rejects a non-string prefix", async () => {
        const app = Fastify();

        await assert.rejects(async () => {
            await app.register(versionify, { pkg: TEST_PKG, prefix: 7 });
        }, TypeError);
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

        await app.register(versionify, { rootDir: "/nonexistent-path-for-test" });
        const res = await app.inject({
            method: "GET",
            url: "/version",
            headers: { accept: "application/json" },
        });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { name: "unknown", version: "0.0.0" });
    });

    test("rejects a non-string rootDir", async () => {
        const app = Fastify();

        await assert.rejects(async () => {
            await app.register(versionify, { rootDir: 42 });
        }, /options\.rootDir to be a string/);
    });

    test("rejects malformed public options with owned errors", async (t) => {
        const cases = [
            { options: { pkg: TEST_PKG, path: 42 }, message: /options\.path/ },
            { options: { pkg: TEST_PKG, path: "version" }, message: /options\.path/ },
            { options: { pkg: { name: 42, version: "1.0.0" } }, message: /pkg\.name/ },
            { options: { pkg: { name: "app", version: {} } }, message: /pkg\.version/ },
            { options: { pkg: TEST_PKG, etag: "false" }, message: /options\.etag/ },
            { options: { pkg: TEST_PKG, metadata: [] }, message: /options\.metadata/ },
            { options: { pkg: TEST_PKG, build: new Date() }, message: /options\.build/ },
        ];

        for (const { options, message } of cases) {
            await t.test(JSON.stringify(options), async () => {
                const app = Fastify();
                await assert.rejects(async () => app.register(versionify, options), message);
            });
        }
    });
});
