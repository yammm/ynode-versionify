# @ynode/versionify

Copyright (c) 2025 Michael Welter <me@mikinho.com>

[![npm version](https://img.shields.io/npm/v/@ynode/versionify.svg)](https://www.npmjs.com/package/@ynode/versionify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A simple and lightweight [Fastify](https://fastify.io/) plugin to expose your application's `name` and `version` from
`package.json`.

It automatically handles content negotiation to respond with JSON, HTML, or plain text based on the client's `Accept`
header.

## Installation

Install the package and its required peer dependency, `fastify`.

```sh
npm install @ynode/versionify fastify

```

## Options

You can pass an options object as the second argument to `register`.

| Option   | Type     | Default      | Description                                                                                                         |
| :------- | :------- | :----------- | :------------------------------------------------------------------------------------------------------------------ |
| `prefix` | `string` | `undefined`  | Optional Fastify route prefix.                                                                                      |
| `path`   | `string` | `"/version"` | The URL path to expose the version endpoint.                                                                        |
| `pkg`    | `object` | `undefined`  | A `package.json` object. If not provided, the plugin will automatically load `package.json` from your project root. |

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

## Release Process

This package uses [`@mikinho/autover`](https://github.com/yammm/ynode-autover) for automated versioning and changelog generation. 

To release a new version seamlessly:
1. Make your code changes in a branch.
2. Open a Pull Request against `main`.
3. Add the **`autover-apply`** label to the Pull Request.
4. Merge the Pull Request.

Upon merge, the GitHub Action runner will automatically bump the package version, update the `CHANGELOG.md`, create a Git tag, and commit the release directly to `main`.

> **Note:** Direct commits to `main` are supported but will gracefully skip the `autover` pipeline to prevent versioning collisions.
