# @instana/opentelemetry-sampler

The Opentelemetry Instana sampler decides if the app will record and sample based
on the [Instana headers](https://www.ibm.com/docs/en/instana-observability/current?topic=monitoring-traces#tracing-headers).

## Installation

    $ npm i --save @instana/opentelemetry-sampler

## Requirements

The sampler should be used together with the `@opentelemetry/propagator-instana`,
because the propagator extracts the incoming HTTP headers.

    $ npm i --save @opentelemetry/propagator-instana

NOTE: Every Instana service/app must forward the [Instana headers](https://www.ibm.com/docs/en/instana-observability/current?topic=monitoring-traces#tracing-headers).

## Usage

```javascript
const api = require('@opentelemetry/api');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { Resource } = require('@opentelemetry/resources');
const { InstanaAlwaysOnSampler } = require('@instana/opentelemetry-sampler');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { InstanaPropagator } = require('@opentelemetry/propagator-instana');

const nodeAutoInstrumentations = getNodeAutoInstrumentations();
api.propagation.setGlobalPropagator(new InstanaPropagator());

const traceOtlpExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
});

const sdk = new opentelemetry.NodeSDK({
  traceExporter: traceOtlpExporter,
  instrumentations: [nodeAutoInstrumentations],
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-service'
  }),
  sampler: new InstanaAlwaysOnSampler()
});

sdk
  .start()
  .then(() => console.log('Tracing initialized'))
  .catch(err => console.log('Error initializing tracing', err));
```