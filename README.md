# Instana Node.js Tracer Monorepo

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

## Instana npm packages

This repository hosts all Instana's Node.js tracer packages.

### Traditional server-based environments

* [@instana/collector](packages/collector/README.md)

### Serverless environments

* [@instana/aws-fargate](https://www.ibm.com/docs/en/instana-observability/current?topic=agents-aws-fargate#nodejs)
* [@instana/aws-lambda](https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs)
* [@instana/google-cloud-run](https://www.ibm.com/docs/en/instana-observability/current?topic=agents-google-cloud-run#nodejs)
* [@instana/azure-container-services](https://www.ibm.com/docs/en/instana-observability/current?topic=services-azure-app-service-tracing-nodejs)

Please use our [@instana/serverless-collector](packages/serverless-collector/README.md) for **any other** serverless environment.


## Breaking Changes

The current major release is `5.x.y`.

Checkout our [breaking changes documentation](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-support-information#breaking-changes-in-nodejs-collector-upgrade).

## Filing Issues

If something is not working as expected or you have a question, instead of opening an issue in this repository, please open a ticket at <https://www.ibm.com/mysupport> instead. Please refrain from filing issues or tickets if your audit tool (npm audit, Snyk, etc.) reported a CVE for the Instana dependencies or transitive dependencies -- we run these audits with every build and take appropriate action automatically.

## Documentation

The documentation for Instana's Node.js support is available on [Node.js page](https://www.ibm.com/docs/en/instana-observability/current?topic=technologies-monitoring-nodejs) of the [Instana documentation portal](https://www.ibm.com/docs/en/instana-observability/current).

Here are a few more quick links:

* [Installation](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation)
* [Native Addons: Profiling, Garbage Collection and Event Loop Information](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#native-add-ons)
* [API](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-instana-api)
