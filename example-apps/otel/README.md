# Otel playground

```sh
OTEL_EXPORTER_OTLP_HEADERS="x-instana-key=xxxx" OTEL_EXPORTER_OTLP_ENDPOINT=otlp-green-saas.instana.io:4317 OTEL_LOG_LEVEL=debug OTEL_SERVICE_NAME=my-js-service node server.js

node kafka-consumer.js
```
