# @instana/collector &nbsp; [![OpenTracing Badge](https://img.shields.io/badge/OpenTracing-enabled-blue.svg)](http://opentracing.io)

Monitor your Node.js applications with Instana!

**[Installation](#installation-and-usage) |**
**[Configuration](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-configuration) |**
**[API](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-instana-api) |**
**[Changelog](https://github.com/instana/nodejs/blob/main/CHANGELOG.md)**

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Restrictions](#restrictions)
- [Breaking Changes](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-support-information#breaking-changes-in-nodejs-collector-upgrade)
- [Installation And Usage](#installation-and-usage)
- [CPU Profiling, Garbage Collection And Event Loop Information](#cpu-profiling-garbage-collection-and-event-loop-information)
- [API / SDK](#api)
- [Filing Issues](#filing-issues)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Restrictions

This package is for monitoring *Node.js server applications* with Instana. 

For monitoring JavaScript applications that:

- Run in a browser, see [Website Monitoring](https://www.ibm.com/docs/en/instana-observability/current?topic=instana-monitoring-websites).

- Run on Amazon Web Services (AWS), see [AWS Lambda](https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs) or [AWS Fargate](https://www.ibm.com/docs/en/instana-observability/current?topic=agents-aws-fargate#nodejs).

- Run on Microsoft Azure, see [Azure App Services](https://www.ibm.com/docs/en/instana-observability/current?topic=services-azure-app-service-tracing-nodejs).

- Run on Google Cloud, see [Google Cloud Run](https://www.ibm.com/docs/en/instana-observability/current?topic=agents-google-cloud-run#nodejs).

## Installation And Usage

The installation of the Instana Node.js collector is a simple two step process. First, install the `@instana/collector` package in your application via:

```javascript
npm install --save @instana/collector
```

Now that the collector is installed, it needs to be activated from within the application. Do this by requiring and initializing it as the *first statement* in your application. Please take care that this is the first statement as the collector will otherwise not be able to access certain information.

```javascript
require('@instana/collector')();

// All other require statements must be done after the collector is initialized.
// Note the () after the require statement of the collector which initializes it.

// const express = require('express');
```

For more in-depth information, refer to the [installation page](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation).

## CPU Profiling, Garbage Collection And Event Loop Information

The Node.js collector uses Native addons for some metrics. Check out the [native addons documentation](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#native-add-ons) for details.

## API / SDK

In most cases it is enough to require and initialize `@instana/collector` and let it do its work. However, there is an [API / SDK](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-instana-api) for more advanced use cases.

## Filing Issues

If something is not working as expected or you have a question, instead of opening an issue in this repository, please open a ticket at <https://www.ibm.com/mysupport> instead. Please refrain from filing issues or tickets if your audit tool (npm audit, Snyk, etc.) reported a CVE for a dependency or a transitive dependency of `@instana/collector` -- we run these audits with every build and take appropriate action automatically.

