# @instana/serverless-collector &nbsp; [![OpenTracing Badge](https://img.shields.io/badge/OpenTracing-enabled-blue.svg)](http://opentracing.io)

Monitor your Node.js applications on **any** serverless environment with Instana!

**Note:** This package is currently under development and marked as **beta**. Before you proceed with updating to a newer version, please ensure to review the release notes for any upcoming changes that could potentially cause compatibility issues.

## Restrictions

The serverless collector **does not** support autotracing and metrics.

## Installation

```sh
npm i @instana/serverless-collector --save
```

```js
// NOTE: The package auto initializes itself.
require('@instana/serverless-collector');
```

For more in-depth documentation, refer to this [page](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-serverless-collector-installation).