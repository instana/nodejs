# Instana Node.js Monorepo

**[Changelog](CHANGELOG.md)** |
**[Contributing](CONTRIBUTING.md)** |
**[@instana/collector](packages/collector/README.md)**

---

This repository hosts Instana's Node.js packages. If you are an Instana user, you are probably looking for the package [@instana/collector](packages/collector/README.md) (formerly known as `instana-nodejs-sensor`) to add Instana monitoring and tracing to your Node.js applications.

## Change of Package Name

To pave the way for new, exciting times to come, we have changed the name of the package in a more modular fashion: up to release `1.64.0`, our npm package was called `instana-nodejs-sensor`. Beginning with version `1.65.0`, the name has changed to `@instana/collector`. **To prevent breaking changes, we are keeping `instana-nodejs-sensor` as an alias for `@instana/collector`**, so you can continue updating your Node.js applications using the latest Instana Node.js integration without further changes. In the future, **we might make some functionality that needs the newly-introduced modularity available only under the new `@instana/collector` package name**. Such new functionality will not affect existing use cases for the Instana Node.js sensor. Please refer to our [migration guide](https://docs.instana.io/ecosystem/node-js/installation/#change-of-package-name) for details.

## Direct Links to the @instana/collector Documentation

The documentation available in the README.md file for the package formerly known as `instana-nodejs-sensor` that was located in the root folder of this repository up until release 1.64.0 has been migrated to the [Node.js page](https://docs.instana.io/ecosystem/node-js/) of the [Instana documentation portal](https://docs.instana.io/). The following sections mostly serve as redirects for people having arrived here following outdated links.

### Installation and Usage

See [installation page](https://docs.instana.io/ecosystem/node-js/installation/).

### CPU Profiling, Garbage Collection and Event Loop Information

See [native addons section](https://docs.instana.io/ecosystem/node-js/installation/#native-addons).

### API

See [API page](https://docs.instana.io/ecosystem/node-js/api/).

### OpenTracing

See [OpenTracing section](https://docs.instana.io/ecosystem/node-js/api/#opentracing-integration).

