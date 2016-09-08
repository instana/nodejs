# Changelog

## 1.10.3
 - Ensure compatibility with Zipkin by receiving span and trace IDs as hex.

## 1.10.2
 - Ensure compatibility with Zipkin by transmitting span and trace IDs as hex.

## 1.10.1
 - Transport cluster name in Elasticsearch spans to allow logical view creation.
 - Transport full URL for HTTP exit spans.

## 1.10.0
 - Be more careful about identification of agent hosts in cases where the identified URL is not actually a URL.
 - Add tracing infrastructure.
 - Add HTTP server tracing.
 - Add HTTP client tracing.
 - Add Elasticsearch tracing.

## 1.9.0
 - Fix errors that can occur when logging to the agent.
 - Combine app and runtime sensor.

## 1.8.0
 - Use keep alive connections for all agent communication.
 - Treat agent ready call timeouts as failed checks.

## 1.7.0
 - Send logs to agent for ease of debugging.
 - Fix agent communication issues were successive announce attempts resulted in announce problems.

## 1.6.2
 - Determined PID is not transmitted to agent during announce phase.

## 1.6.1
 - Do not depend on a specific command name when parsing `/proc/<pid>/sched` files.

## 1.6.0
 - Read PID from `/proc/<pid>/sched` for increased robustness in cases where the Node.js sensor is running in a different PID namespace than the agent.

## 1.5.1
 - Increase log level for failed agent communication to warn.

## 1.5.0
 - Track Node.js internal handle and request counts.
 - Report application start time to calculate uptime.

## 1.4.0
 - Support Docker bridge networks by attempting agent communication with the container's default gateway.
 - Support custom agent HTTP ports and name.

## 1.3.3
 - Improve announce cycle stability.

## 1.3.2
 - Use a more efficient data structure for heap space data.

## 1.3.1
 - `v8` module does not exist in early Node.js versions.

## 1.3.0
 - Retrieve heap space statistics.

## 1.2.0
 - Support varying log levels and output destinations.

## 1.1.2
 - Requests may hang and put sensor in endless announce cycle.

## 1.1.1
 - Identification of `event-loop-stats` availability always fails.

## 1.1.0
 - Allow sensor execution without native addons.

## 1.0.0
 - Initial release
