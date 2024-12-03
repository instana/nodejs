# Otel playground

- Choose an [OTLP acceptor endpoint](https://www.ibm.com/docs/en/instana-observability/current?topic=instana-backend#endpoints-of-the-instana-backend-otlp-acceptor).
- Read the x-instana-key from the agent installation docs of the target SaaS instance.
- You can also just start and play without adding the endpoint and key.

```sh
OTEL_EXPORTER_OTLP_HEADERS="x-instana-key=xxxx" OTEL_EXPORTER_OTLP_ENDPOINT=endpoint OTEL_LOG_LEVEL=debug OTEL_SERVICE_NAME=my-js-service node server.js

node kafka-consumer.js
```
