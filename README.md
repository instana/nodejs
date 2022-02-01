# Instana Node.js Monorepo

**[Changelog](CHANGELOG.md)** |
**[Contributing](CONTRIBUTING.md)** |
**[@instana/collector](packages/collector/README.md)**

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Instana npm Packages](#instana-npm-packages)
- [Filing Issues](#filing-issues)
- [Documentation](#documentation)
- [Legacy Package Name `instana-nodejs-sensor`](#legacy-package-name-instana-nodejs-sensor)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Instana npm Packages

This repository hosts Instana's Node.js packages. If you are an Instana user, you are probably looking for the package [@instana/collector](packages/collector/README.md) to add Instana monitoring and tracing to your Node.js applications.

The following packages are meant for direct consumption by Instana users, all  other packages in this repo are for internal use only:
* `@instana/aws-fargate`: See <https://www.ibm.com/docs/de/obi/current?topic=agents-monitoring-aws-fargate#nodejs>.
* `@instana/aws-lambda`: See <https://www.ibm.com/docs/de/obi/current?topic=kinesis-aws-lambda-native-tracing-nodejs#supported-runtimes>.
* `@instana/collector`: See <https://www.ibm.com/docs/de/obi/current?topic=technologies-monitoring-nodejs>.
* `@instana/google-cloud-run`: See <https://www.ibm.com/docs/de/obi/current?topic=agents-monitoring-google-cloud-run#instana-cloud-native-buildpack-for-google-cloud-run> or <https://www.ibm.com/docs/de/obi/current?topic=agents-monitoring-google-cloud-run#nodejs>.

## Filing Issues

If something is not working as expected or you have a question, instead of opening an issue in this repository, please open a ticket at <https://support.instana.com/hc/requests/new> instead. Please refrain from filing issues or tickets if your audit tool (npm audit, Snyk, etc.) reported a CVE for a dependency or a transitive dependency of `@instana/collector` -- we run these audits with every build and take appropriate action automatically.

## Documentation

The documentation for Instana's Node.js support is available on [Node.js page](https://www.ibm.com/docs/de/obi/current?topic=technologies-monitoring-nodejs) of the [Instana documentation portal](https://www.ibm.com/docs/de/obi/current).

Here are a few more quick links:

* [Installation](https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation)
* [Native Addons: Profiling, Garbage Collection and Event Loop Information](https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#native-addons)
* [API](https://www.ibm.com/docs/de/obi/current?topic=nodejs-instana-api).

## Legacy Package Name `instana-nodejs-sensor`

Up to release `1.64.0` (April 2019), the package `@instana/collector` was called `instana-nodejs-sensor`. Beginning with version `1.65.0`, the name had changed to `@instana/collector`. We continued to publish the package under the deprecated alias `instana-nodejs-sensor` for backwards compatibilty for all `1.x.y` versions, for a grace period of over 2.5 years. Starting with version `2.0.0`, the package `instana-nodejs-sensor` will no longer be updated. Please refer to our [migration guide](https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#change-of-package-name) for details.

