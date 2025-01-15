# @instana/opentelemetry-exporter

An [OpenTelemetry exporter](https://opentelemetry.io/docs/js/exporters/) to Instana specific span format.

## Installation

    $ npm i --save @instana/opentelemetry-exporter

## Instana and OpenTelemetry Versions

Even though the [Instana Node.js SDK supports several versions of Node.js](https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-support-information#supported-nodejs-versions),
users of the Instana Exporter must take into consideration the
[versions supported by the OpenTelemetry instrumentator](https://github.com/open-telemetry/opentelemetry-js#supported-runtimes).

Making sure that the Node.js version used in your application fulfills both Instana Exporter and OpenTelemetry SDK versions
is particularly important for Instana customers who wish to migrate from the Instana Collector to OpenTelemetry.

## Usage

The Instana Node.js OpenTelemetry exporter for serverless works just like any OpenTelemetry exporter.
Once you have your application properly set to be monitored by the OpenTelemetry SDK, the injected tracing module
expects an exporter. In our case, the Instana exporter must be imported and instantiated to be used by the
OpenTelemetry tracing.

The code sample below demonstrates how the tracing module could look like with the Instana exporter:

```javascript
'use strict';

const process = require('process');
require('@opentelemetry/api');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Import the Instana OpenTelemetry Exporter
const { InstanaExporter } = require('@instana/opentelemetry-exporter');

// Instantiate the Instana Exporter.
// Make sure to provide the proper agent key and backend endpoint URL.
// You can provide the agent key and backend endpoint URL via the following environment variables:
// * INSTANA_AGENT_KEY
// * INSTANA_ENDPOINT_URL
//
// Alternatively, you can pass these values as an argument to the constructor (see bellow), although it is strongly
// recommended that such sensitive data is not hard coded in the code base.
// Eg: const instanaTraceExporter = new InstanaExporter({ agentKey: 'agent_key', endpointUrl: 'endpoint_url' });
const instanaTraceExporter = new InstanaExporter();

const nodeAutoInstrumentations = getNodeAutoInstrumentations();

const sdk = new opentelemetry.NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-service'
  }),
  // Configure OpenTelemetry to use the Instana Exporter
  traceExporter: instanaTraceExporter,
  instrumentations: [nodeAutoInstrumentations]
});

sdk
  .start()
  .then(() => console.log('Tracing initialized'))
  .catch(error => console.log('Error initializing tracing', error));

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch(error => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
```
Assuming that your main application is already importing the tracing module, this is all you have to do.
Your spans will be properly exported from your OpenTelemetry tracer to the Instana backend.
