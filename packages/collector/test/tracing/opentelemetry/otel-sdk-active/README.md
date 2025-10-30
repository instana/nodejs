# OpenTelemetry SDK Active Test

This test verifies the behavior when both the Instana collector and OpenTelemetry SDK are active in the same application.

## Initialization Order

The test supports two initialization orders:

1. **OpenTelemetry First (Default)**: The OpenTelemetry SDK is initialized before the Instana collector.
2. **Collector First**: The Instana collector is initialized before the OpenTelemetry SDK.

## Environment Variables

- `COLLECTOR_FIRST`: Controls the initialization order
  - When set to `true`, the collector is initialized first
  - When not set or set to `false`, OpenTelemetry is initialized first (default)

## Running the Tests

The test.js file includes test cases for both initialization orders:

- `when otel sdk is active (OpenTelemetry initialized first)`: Tests the default behavior
- `when otel sdk is active (Collector initialized first)`: Tests with COLLECTOR_FIRST=true

## Expected Behavior

Both initialization orders should result in proper tracing with both Instana and OpenTelemetry spans being captured. The test verifies that:

1. HTTP entry spans are captured
2. OpenTelemetry spans for fs operations are captured
3. Explicit OpenTelemetry spans are captured

## Implementation Details

The app.js file uses conditional initialization based on the COLLECTOR_FIRST environment variable:

```javascript
// Check environment variable and initialize in the appropriate order
const collectorFirst = process.env.COLLECTOR_FIRST === 'true';
let tracer;

if (collectorFirst) {
  log('Collector first mode: initializing collector before OpenTelemetry');
  initializeCollector();
  tracer = initializeOpenTelemetry();
} else {
  log('OpenTelemetry first mode: initializing OpenTelemetry before collector (default)');
  tracer = initializeOpenTelemetry();
  initializeCollector();
}