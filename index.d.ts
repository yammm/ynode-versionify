import { FastifyPluginAsync } from "fastify";

export interface VersionifyOptions {
    /**
     * The route prefix to serve the version information on.
     * @default '/_version'
     */
    prefix?: string;
}

export const versionify: FastifyPluginAsync<VersionifyOptions>;
export default versionify;
