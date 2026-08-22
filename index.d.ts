import type { FastifyPluginAsync } from "fastify";

export type VersionifyMetadataValue =
    | string
    | number
    | boolean
    | bigint
    | null
    | Date
    | VersionifyMetadataValue[]
    | { [key: string]: VersionifyMetadataValue };

export interface VersionifyOptions {
    /**
     * The URL path to expose the version info.
     * Must start with "/".
     * @default "/version"
     */
    path?: string;

    /**
     * The URL prefix to expose the version info.
     * Must start with "/".
     */
    prefix?: string;

    /**
     * A package.json object. If not provided, it's loaded from the project root.
     */
    pkg?: { name?: string; version?: string; [key: string]: unknown };

    /**
     * Directory whose package.json is loaded when `pkg` is not provided.
     * @default process.cwd()
     */
    rootDir?: string;

    /**
     * Cache-Control max-age in seconds. Set to 0 to disable.
     * @default 3600
     */
    cacheMaxAge?: number;

    /**
     * Additional static key-value pairs included in the JSON response.
     * Keys "name", "version", and "build" are reserved and will be ignored;
     * build metadata belongs in the dedicated `build` option.
     */
    metadata?: Record<string, VersionifyMetadataValue>;

    /**
     * Additional build metadata nested under "build" in the JSON response.
     * Valid Dates become ISO strings, invalid Dates become null, and BigInts become strings.
     */
    build?: Record<string, VersionifyMetadataValue>;

    /**
     * Emit ETag and honor If-None-Match conditional requests.
     * @default true
     */
    etag?: boolean;
}

declare module "fastify" {
    interface FastifyInstance {
        /**
         * True when @ynode/versionify has been registered.
         */
        versionify: boolean;
    }
}

declare const versionify: FastifyPluginAsync<VersionifyOptions>;
export default versionify;
