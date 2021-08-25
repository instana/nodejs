# Instana Node.js Monorepo

**[Changelog](CHANGELOG.md)** |
**[Contributing](CONTRIBUTING.md)** |
**[@instana/collector](packages/collector/README.md)**

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Instana npm Packages](#instana-npm-packages)
- [Filing Issues](#filing-issues)
- [Direct Links to the @instana/collector Documentation](#direct-links-to-the-instanacollector-documentation)
  - [Installation and Usage](#installation-and-usage)
  - [CPU Profiling, Garbage Collection and Event Loop Information](#cpu-profiling-garbage-collection-and-event-loop-information)
  - [API](#api)
  - [OpenTracing](#opentracing)
- [Change of Package Name](#change-of-package-name)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Instana npm Packages

This repository hosts Instana's Node.js packages. If you are an Instana user, you are probably looking for the package [@instana/collector](packages/collector/README.md) to add Instana monitoring and tracing to your Node.js applications.

The following packages are meant for direct consumption by Instana users, all  other packages in this repo are for internal use only:
* `@instana/aws-fargate`: See <https://www.instana.com/docs/ecosystem/aws-fargate/#nodejs>.
* `@instana/aws-lambda`: See <https://www.instana.com/docs/ecosystem/aws-lambda/nodejs/>.
* `@instana/collector`: See <https://www.instana.com/docs/ecosystem/node-js/>.
* `@instana/google-cloud-run`: See <https://www.instana.com/docs/ecosystem/google-cloud-run#instana-cloud-native-buildpack-for-google-cloud-run> or <https://www.instana.com/docs/ecosystem/google-cloud-run#nodejs>.

## Filing Issues

If something is not working as expected or you have a question, instead of opening an issue in this repository, please open a ticket at <https://support.instana.com/hc/requests/new> instead. Please refrain from filing issues or tickets if your audit tool (npm audit, Snyk, etc.) reported a CVE for a dependency or a transitive dependency of `@instana/collector` -- we run these audits with every build and take appropriate action automatically.

## Direct Links to the @instana/collector Documentation

The documentation available in the README.md file for the package formerly known as `instana-nodejs-sensor` that was located in the root folder of this repository up until release 1.64.0 has been migrated to the [Node.js page](https://www.instana.com/docs/ecosystem/node-js/) of the [Instana documentation portal](https://www.instana.com/docs/). The following sections mostly serve as redirects for people having arrived here following outdated links.

### Installation and Usage

See [installation page](https://www.instana.com/docs/ecosystem/node-js/installation/).

### CPU Profiling, Garbage Collection and Event Loop Information

See [native addons section](https://www.instana.com/docs/ecosystem/node-js/installation/#native-addons).

### API

See [API page](https://www.instana.com/docs/ecosystem/node-js/api/).

### OpenTracing

See [OpenTracing section](https://www.instana.com/docs/ecosystem/node-js/api/#opentracing-integration).

## Change of Package Name

Up to release `1.64.0` (April 2019), the package `@instana/collector` was called `instana-nodejs-sensor`. Beginning with version `1.65.0`, the name has changed to `@instana/collector`.lease refer to our [migration guide](https://www.instana.com/docs/ecosystem/node-js/installation/#change-of-package-name) for details.

