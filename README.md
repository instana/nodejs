# Instana Node.js Monorepo

**[Changelog](CHANGELOG.md)** |
**[Contributing](CONTRIBUTING.md)** |
**[@instana/collector](packages/collector/README.md)**

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Instana npm Packages](#instana-npm-packages)
- [Breaking Changes](#breaking-changes)
- [Filing Issues](#filing-issues)
- [Documentation](#documentation)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Instana npm Packages

This repository hosts Instana's Node.js packages. If you are an Instana user, you are probably looking for the package [@instana/collector](packages/collector/README.md) to add Instana monitoring and tracing to your Node.js applications.

The following packages are meant for direct consumption by Instana users, all  other packages in this repo are for internal use only:
* `@instana/aws-fargate`: See <https://www.ibm.com/docs/en/instana-observability/current?topic=agents-aws-fargate#nodejs>.
* `@instana/aws-lambda`: See <https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs>.
* `@instana/collector`: See <https://www.ibm.com/docs/en/instana-observability/current?topic=technologies-monitoring-nodejs>.
* `@instana/google-cloud-run`: See <https://www.ibm.com/docs/en/instana-observability/current?topic=agents-google-cloud-run#nodejs>.
* `@instana/azure-container-services`: See <https://www.ibm.com/docs/en/instana-observability/current?topic=services-azure-app-service-tracing-nodejs>.

## Breaking Changes

The current major release is `3.x.y`.

Checkout our [breaking changes documentation](https://www.ibm.com/docs/en/obi/current?topic=technologies-monitoring-nodejs#breaking-changes).

## Filing Issues

If something is not working as expected or you have a question, instead of opening an issue in this repository, please open a ticket at <https://www.ibm.com/mysupport> instead. Please refrain from filing issues or tickets if your audit tool (npm audit, Snyk, etc.) reported a CVE for a dependency or a transitive dependency of `@instana/collector` -- we run these audits with every build and take appropriate action automatically.

## Documentation

The documentation for Instana's Node.js support is available on [Node.js page](https://www.ibm.com/docs/en/instana-observability/current?topic=technologies-monitoring-nodejs) of the [Instana documentation portal](https://www.ibm.com/docs/en/instana-observability/current).

Here are a few more quick links:

* [Installation](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation)
* [Native Addons: Profiling, Garbage Collection and Event Loop Information](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#native-add-ons)
* [API](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-instana-api).
