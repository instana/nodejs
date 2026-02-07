/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const process = require('process');
require('@opentelemetry/api');
const logPrefix = `OpenTelemetry tracing (${process.pid}):\t`;
const log = require('@_local/core/test/test_util/log').getLogger(logPrefix);
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { InstanaExporter } = require('../src/index');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const pinkAgentKey = '';
const pinkEndpointUrl = '';

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

const nodeAutoInstrumentations = getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-fs': {
    enabled: false
  }
});

const sdk = new opentelemetry.NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME.SERVICE_NAME]: 'my-service'
  }),
  spanProcessor: spanProcessor,
  instrumentations: [nodeAutoInstrumentations]
});

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
