# Instana Node.js Monorepo

**[Changelog](CHANGELOG.md)** |
**[Contributing](CONTRIBUTING.md)** |
**[@instana/collector](packages/collector/README.md)**

---

This repository hosts Instana's Node.js packages. If you are an Instana user, you are probably looking for the package [@instana/collector](packages/collector/README.md) (formerly known as `instana-nodejs-sensor`) to add Instana monitoring and tracing to your Node.js applications.

## Important: Change of Package Name

To pave the way for new, exciting times to come, we are changing the name of the package in a more modular fashion: up to release `1.64.0`, our npm package is called `instana-nodejs-sensor`. Beginning with version `1.65.0` the name has changed to `@instana/collector`. **To prevent breaking changes, we are keeping `instana-nodejs-sensor` as an alias for `@instana/collector`**, so you can continue updating your Node.js applications using the latest Instana Node.js integration without further changes. In the future, **we might make some new functionality that needs the newly-introduced modularity  only under the new package name**. Such new functionality will not affect existing use-cases for the Instana Node.js sensor. Please refer to our [migration guide](https://github.com/instana/nodejs-sensor/tree/master/packages/collector#migrating-from-instana-nodejs-sensor-to-instanacollector) for details.

## Direct Links to @instana/collector

The README file for the package formerly known as `instana-nodejs-sensor` that was located in the root folder of this repository up until release 1.64.0 has moved to the [@instana/collector](packages/collector/README.md) package. The following sections mostly serve as redirects for people having arrived here following outdated links.

### Server Only

See [@instana/collector Server Only section](packages/collector/README.md#server-only).

### Installation and Usage

See [@instana/collector Installation and Usage](packages/collector/README.md#installation-and-usage).

### CPU Profiling, Garbage Collection and Event Loop Information

See [@instana/collector Native Extensions section](packages/collector/README.md#cpu-profiling-garbage-collection-and-event-loop-information).

### API

See [@instana/collector API](packages/collector/API.md).

### OpenTracing

See [@instana/collector OpenTracing API](packages/collector/API.md#opentracing-integration).

### FAQ

See [@instana/collector FAQ](packages/collector/README.md#faq).

#### How can the Node.js collector be disabled for (local) development?

See [@instana/collector](packages/collector/README.md#how-can-the-nodejs-collector-be-disabled-for-local-development).
