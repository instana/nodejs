/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const process = require('process');
const api = require('@opentelemetry/api');
const logPrefix = `OpenTelemetry Sampler tracing (${process.pid}):\t`;
const log = require('@_local/core/test/test_util/log').getLogger(logPrefix);
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { InstanaExporter } = require('../../opentelemetry-exporter/src/index');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { InstanaPropagator } = require('@opentelemetry/propagator-instana');
const { InstanaAlwaysOnSampler } = require('../src');

const pinkAgentKey = '';
const pinkEndpointUrl = '';

const nodeAutoInstrumentations = getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-fs': {
    enabled: false
  }
});

api.propagation.setGlobalPropagator(new InstanaPropagator());

const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
let sdk;

if (otelEndpoint) {
  const traceOtlpExporter = new OTLPTraceExporter({
    url: otelEndpoint
  });

  sdk = new opentelemetry.NodeSDK({
    traceExporter: traceOtlpExporter,
    instrumentations: [nodeAutoInstrumentations],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME.SERVICE_NAME]: 'my-service'
    }),
    sampler: new InstanaAlwaysOnSampler()
  });
} else {
  const traceExporter = new InstanaExporter({ agentKey: pinkAgentKey, endpointUrl: pinkEndpointUrl });
  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    /**
     * Keep this time short. This is the interval in which the exporter is called.
     * Sometimes the exporter doesn't send all spans at once.
     * This short time assures that the remaining spans to be processed are called before the backend times out before
     * processing them, causing an error in the test.
     */
    scheduledDelayMillis: 100
  });

  sdk = new opentelemetry.NodeSDK({
    instrumentations: [nodeAutoInstrumentations],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME.SERVICE_NAME]: 'my-service'
    }),
    spanProcessor: spanProcessor,
    sampler: new InstanaAlwaysOnSampler()
  });
}

// initialize the SDK and register with the OpenTelemetry API
// this enables the API to record telemetry
sdk.start();

// gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => log('Tracing terminated'))
    .catch(error => log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
