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
     * @default "/version"
     */
    path?: string;

    /**
     * The URL prefix to expose the version info.
     */
    prefix?: string;

    /**
     * A package.json object. If not provided, it's loaded from the project root.
     */
    pkg?: { name?: string; version?: string; [key: string]: unknown };

    /**
     * Cache-Control max-age in seconds. Set to 0 to disable.
     * @default 3600
     */
    cacheMaxAge?: number;

    /**
     * Additional static key-value pairs included in the JSON response.
     * Keys "name" and "version" are reserved and will be ignored.
     */
    metadata?: Record<string, VersionifyMetadataValue>;

    /**
     * Additional build metadata nested under "build" in the JSON response.
     * Dates become ISO strings and BigInts become strings.
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

export const versionify: FastifyPluginAsync<VersionifyOptions>;
export default versionify;
