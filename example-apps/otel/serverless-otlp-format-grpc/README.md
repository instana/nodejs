# Serverless OpenTelemetry OTLP traces and metrics

## Requirements

- Choose an [OTLP acceptor endpoint](https://www.ibm.com/docs/en/instana-observability/current?topic=instana-backend#endpoints-of-the-instana-backend-otlp-acceptor).
- Read the x-instana-key from the agent installation docs of the target SaaS instance.

## Installation

```sh
npm install @grpc/grpc-js --save
npm install @opentelemetry/api --save
npm install @opentelemetry/auto-instrumentations-node --save
npm install @opentelemetry/exporter-metrics-otlp-grpc --save
npm install @opentelemetry/exporter-trace-otlp-grpc --save
npm install @opentelemetry/host-metrics --save
npm install @opentelemetry/instrumentation-kafkajs --save
npm install @opentelemetry/sdk-metrics --save
npm install @opentelemetry/sdk-node --save
npm install express --save
npm install kafkajs --save
```

## Start

```sh
INSTANA_KEY=xxx OTEL_EXPORTER_OTLP_ENDPOINT=yyy OTEL_LOG_LEVEL=debug OTEL_SERVICE_NAME=node-otlp-grpc npm start

node kafka-consumer.js
```
