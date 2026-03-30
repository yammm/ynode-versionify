# @ynode/versionify

Copyright (c) 2025 Michael Welter <me@mikinho.com>

[![npm version](https://img.shields.io/npm/v/@ynode/versionify.svg)](https://www.npmjs.com/package/@ynode/versionify) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A simple and lightweight [Fastify](https://fastify.io/) plugin to expose your application's `name` and `version` from `package.json`.

It automatically handles content negotiation to respond with JSON, HTML, or plain text based on the client's `Accept` header.

## Installation

Install the package and its required peer dependency, `fastify`.

```sh
npm install @ynode/versionify fastify

```

## Options

You can pass an options object as the second argument to `register`.

| Option | Type | Default | Description |
| :-- | :-- | :-- | :-- |
| `prefix` | `string` | `undefined` | Optional Fastify route prefix. |
| `path` | `string` | `"/version"` | The URL path to expose the version endpoint. |
| `pkg` | `object` | `undefined` | A `package.json` object. If not provided, the plugin will automatically load `package.json` from your project root. |
| `cacheMaxAge` | `number` | `3600` | `Cache-Control` max-age in seconds. Set to `0` to disable. |
| `metadata` | `object` | `undefined` | Additional static key-value pairs included in the JSON response. Keys `name` and `version` are reserved and will be ignored. |

## Basic Usage

```javascript
import versionify from "@ynode/versionify";

// Register the plugin with default options
await fastify.register(versionify, { prefix: "/~" });
```

### Example with Options

```javascript
import versionify from "@ynode/versionify";

// Register with a custom path
await fastify.register(versionify, {
    path: "/info",
});
```

Now the endpoint will be available at `http://localhost:3000/info`.

### Example with Metadata and Cache Control

```javascript
import process from "node:process";
import versionify from "@ynode/versionify";

await fastify.register(versionify, {
    metadata: { environment: "production", nodeVersion: process.version },
    cacheMaxAge: 7200,
});
```

The JSON response will include all metadata fields alongside `name` and `version`:

```json
{
    "name": "my-app",
    "version": "2.1.0",
    "environment": "production",
    "nodeVersion": "v22.0.0"
}
```

## License

This project is licensed under the [MIT Lisence](./LICENSE).
