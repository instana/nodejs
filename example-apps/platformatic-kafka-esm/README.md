# @platformatic/kafka ESM Example

An example ESM application that uses [`@platformatic/kafka`](https://www.npmjs.com/package/@platformatic/kafka) and is instrumented by [`@instana/collector`](https://www.npmjs.com/package/@instana/collector) via the **ESM register** hook (`--import`).

## How instrumentation works

[`@instana/collector/esm-register.mjs`](../../packages/collector/esm-register.mjs) is loaded via Node.js `--import` **before** the application module graph is evaluated:

```
node --import @instana/collector/esm-register.mjs producer.mjs
```

It does two things:

1. **Initialises the Instana collector** in the main thread (equivalent to `require('@instana/collector')()`).
2. **Registers the `import-in-the-middle` (IITM) hook** via `node:module`'s `register()` API, which allows Instana to intercept and instrument ESM modules as they are loaded.

### How @platformatic/kafka is instrumented

`@platformatic/kafka` exposes [node:diagnostics_channel](https://nodejs.org/api/diagnostics_channel.html) tracing channels (`plt:kafka:producer:sends:*` and `plt:kafka:consumer:receives:*`). Instana subscribes to these channels at startup, so **no IITM wrapping of the package is needed**. This also sidesteps the TDZ crash that the package's internal circular ESM dependency would otherwise cause under IITM.

## Requirements

- Node.js ≥ 18.19 (required for `--import` and `node:module` `register()`)
- A running Kafka broker (default: `localhost:9092`)
- A running Instana agent (default port: `42699`)

## Installation

```sh
npm install
```

## Running

### Producer

```sh
# Using the npm script:
npm run start:producer

# Or directly:
node --import @instana/collector/esm-register.mjs producer.mjs
```

The producer starts an Express server on port `3000` (configurable via `APP_PORT`).

Send a message:

```sh
curl -X POST http://localhost:3000/send \
  -H 'Content-Type: application/json' \
  -d '{"key":"my-key","value":"hello from ESM"}'
```

### Consumer

```sh
# Using the npm script:
npm run start:consumer

# Or directly:
node --import @instana/collector/esm-register.mjs consumer.mjs
```

The consumer starts an Express server on port `3001` (configurable via `APP_PORT`) and streams messages from the topic using an async iterator.

List received messages:

```sh
curl http://localhost:3001/messages
```

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `APP_PORT` | `3000` / `3001` | HTTP server port |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated list of Kafka broker addresses |
| `KAFKA_TOPIC` | `platformatic-kafka-esm-topic` | Kafka topic to produce/consume |
| `KAFKA_GROUP_ID` | `esm-example-consumer-<uuid>` | Consumer group ID (consumer only) |
| `INSTANA_AGENT_HOST` | `127.0.0.1` | Instana agent host |
| `INSTANA_AGENT_PORT` | `42699` | Instana agent port |
