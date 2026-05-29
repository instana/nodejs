# Agent-based-http

## Requirements

- Instana Agent is running locally
- Get the x-instana-key from the agent installation docs of the target SaaS instance.

## Installation

```sh
npm i
```

## Start

```sh
OTEL_LOG_LEVEL=debug OTEL_SERVICE_NAME=node-agent-based-otel-sdk npm start
node kafka-consumer.js

curl http://localhost:6215/http
curl -X POST http://localhost:6215/kafka-msg
```
