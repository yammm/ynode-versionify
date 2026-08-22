import Fastify from "fastify";

import versionify, {
    type VersionifyMetadataValue,
    type VersionifyOptions,
} from "@ynode/versionify";
// @ts-expect-error The runtime and declarations intentionally expose only a default plugin export.
import { versionify as namedVersionify } from "@ynode/versionify";

const circular: VersionifyMetadataValue[] = [];
circular.push(circular);

const options: VersionifyOptions = {
    path: "/build/version",
    pkg: { name: "consumer", version: "1.0.0" },
    metadata: { environment: "test" },
    build: {
        circular,
        createdAt: new Date(),
        sequence: 7n,
    },
    cacheMaxAge: 0,
    etag: true,
};

const app = Fastify();
await app.register(versionify, options);
const registered: boolean = app.versionify;

void [namedVersionify, registered];
await app.close();
