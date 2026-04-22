/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const process = require('process');
require('@opentelemetry/api');
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Require the Instana OpenTelemetry Exporter
const { InstanaExporter } = require('@instana/opentelemetry-exporter');

// Instantiate the Instana Exporter.
// Make sure to provide the agent key and the serverless endpoint URL via the following environment variables:
// * INSTANA_AGENT_KEY
// * INSTANA_ENDPOINT_URL
const instanaTraceExporter = new InstanaExporter();

/*
 * If you have not provided the agent key and the serverless endpoint URL via environment variables:
 * const instanaTraceExporter = new InstanaExporter({ agentKey: 'agent_key', endpointUrl: 'endpoint_url' });
 */

const nodeAutoInstrumentations = getNodeAutoInstrumentations();

const sdk = new opentelemetry.NodeSDK({
  traceExporter: instanaTraceExporter,
  instrumentations: [nodeAutoInstrumentations]
});

sdk.start();
