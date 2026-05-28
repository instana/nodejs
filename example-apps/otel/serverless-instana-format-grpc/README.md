# Serverless OpenTelemetry Instana format

## Requirements

- Choose an [OTLP acceptor endpoint](https://www.ibm.com/docs/en/instana-observability/current?topic=instana-backend#endpoints-of-the-instana-backend-otlp-acceptor).
- Read the x-instana-key from the agent installation docs of the target SaaS instance.

## Restrictions

- No metrics support yet.

## Installation

```sh
npm i
```

## Start

```sh
INSTANA_AGENT_KEY="xx" INSTANA_ENDPOINT_URL="https://serverless-x-saas.instana.io" OTEL_LOG_LEVEL=debug OTEL_SERVICE_NAME=node-otel-instana-1 npm start
node kafka-consumer.js

curl http://localhost:6215/http
curl -X POST http://localhost:6215/kafka-msg
```
