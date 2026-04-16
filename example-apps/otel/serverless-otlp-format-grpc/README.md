# Serverless OpenTelemetry OTLP traces and metrics

- Choose an [OTLP acceptor endpoint](https://www.ibm.com/docs/en/instana-observability/current?topic=instana-backend#endpoints-of-the-instana-backend-otlp-acceptor).
- Read the x-instana-key from the agent installation docs of the target SaaS instance.

```sh
INSTANA_KEY=xxxx OTEL_EXPORTER_OTLP_ENDPOINT=otlp-green-saas.instana.io:4317 OTEL_LOG_LEVEL=debug OTEL_SERVICE_NAME=node-otlp-grpc npm start

node kafka-consumer.js
```
