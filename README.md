# @ynode/versionify

Copyright (c) 2025 Michael Welter <me@mikinho.com>

[![npm version](https://img.shields.io/npm/v/@ynode/versionify.svg)](https://www.npmjs.com/package/@ynode/versionify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Node.js [Fastify](https://www.fastify.io/) plugin to expose the version of the current web app via
RESTful API call.

## Installation

Install the package and its required peer dependency, `fastify`.

```sh
npm install @ynode/versionify fastify

```

## Basic Usage

```javascript
import versionify from "@ynode/versionify";

// Register the plugin with default options
await fastify.register(versionify, { prefix: "/~" });

// Register with a custom path
await fastify.register(versionify, { path: "/info" });
```

## Release

To release a new version, use the included Makefile.

```sh
make release VERSION=1.2.3
```

This command will:

1.  Check that `npm` and `package.json` exist.
2.  Run `npm version` to update `package.json` and create a git tag.
3.  Publish the package to npm.
4.  Push the commit and tags to the git remote.

## License

This project is licensed under the [MIT Lisence](./LICENSE).
