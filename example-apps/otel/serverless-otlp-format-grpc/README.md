# Serverless OpenTelemetry OTLP format

## Requirements

- Choose an [OTLP acceptor endpoint](https://www.ibm.com/docs/en/instana-observability/current?topic=instana-backend#endpoints-of-the-instana-backend-otlp-acceptor).
- Read the x-instana-key from the agent installation docs of the target SaaS instance.

## Installation

```sh
npm i
```

## Start

```sh
INSTANA_KEY=xxx OTEL_EXPORTER_OTLP_ENDPOINT=yyy OTEL_LOG_LEVEL=debug OTEL_SERVICE_NAME=node-otlp-grpc npm start
node kafka-consumer.js

curl http://localhost:6215/http
curl -X POST http://localhost:6215/kafka-msg
```
