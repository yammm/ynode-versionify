import assert from "node:assert";
import { test } from "node:test";
import Fastify from "fastify";
import versionify from "../src/plugin.js";

test("versionify plugin exposes version route with different accept headers", async () => {
    const app = Fastify();
    await app.register(versionify, {
        pkg: { name: "test-app", version: "1.2.3" }
    });

    // JSON response
    let response = await app.inject({
        method: "GET",
        url: "/version",
        headers: { accept: "application/json" }
    });
    assert.strictEqual(response.statusCode, 200);
    assert.deepStrictEqual(response.json(), { name: "test-app", version: "1.2.3" });

    // HTML response
    response = await app.inject({
        method: "GET",
        url: "/version",
        headers: { accept: "text/html" }
    });
    assert.strictEqual(response.statusCode, 200);
    assert.match(response.payload, /<b>test-app<\/b> v<em>1\.2\.3<\/em>/);

    // text/plain response
    response = await app.inject({
        method: "GET",
        url: "/version",
        headers: { accept: "text/plain" }
    });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.payload, "test-app v1.2.3");
});

test("versionify rejects duplicate registration", async () => {
    const app = Fastify();
    await app.register(versionify);
    await assert.rejects(app.register(versionify), /has already been registered/);
});
