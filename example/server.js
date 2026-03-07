import Fastify from "fastify";
import versionify from "../src/plugin.js";

const app = Fastify({ logger: true });

// Instantly expose a `/version` endpoint providing the name and version 
// extracted intelligently from `package.json` with REST Content-Type routing.
await app.register(versionify, {
    path: "/version",
});

try {
    await app.listen({ port: 3000 });
    console.log("Server listening at http://localhost:3000");
    console.log("Test JSON API: curl -H 'Accept: application/json' http://localhost:3000/version");
    console.log("Test HTML Page: curl -H 'Accept: text/html' http://localhost:3000/version");
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
