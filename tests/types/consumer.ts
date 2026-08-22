import Fastify from "fastify";

import versionify, {
    type VersionifyMetadataValue,
    type VersionifyOptions,
} from "@ynode/versionify";
import packageMetadata from "@ynode/versionify/package.json" with { type: "json" };
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
    requireIdentity: true,
};

const app = Fastify();
await app.register(versionify, options);
const registered: boolean = app.versionify;
const packageName: string = packageMetadata.name;

void [namedVersionify, packageName, registered];
await app.close();
