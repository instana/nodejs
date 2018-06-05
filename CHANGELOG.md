# Changelog

## Unreleased
 - Protect spans from accidental retransmission.
 - Abort HTTP requests to the agent on timeouts.

## 1.38.2
 - ioredis: Correctly manage tracing context in ioredis instrumentation

## 1.38.1
 - OpenTracing baggage is not defined on span context when using `getCurrentlyActiveInstanaSpanContext`.

## 1.38.0
 - Enable tracing in Node.js `^10.0.0`.
 - Regression in MongoDB instrumentation which attempts to access optional `operationId` properties.

## 1.37.3
 - Prepare support for 128bit trace IDs.
 - Reduce memory footprint when using HTTP agents with `maxSockets: Infinity`.

## 1.37.2
 - MongoDB: Properly initialize and assure operationId is generated

## 1.37.1
 - ioRedis instrumentation can lead to errors when async correlation doesn't work as expected.
 - Add tracing support for mysql2/promise.
 - Switch to `@risingstack/v8-profiler` due to security issues in transitive dependencies of `v8-profiler`.

## 1.37.0
 - Enable tracing in Node.js `^9.1.0`.

## 1.36.1
 - Reduce severity in log messages which describe dependency analysis failures.
 - Upgrade `event-loop-lag` to address [security vulnerability](https://nodesecurity.io/advisories/534) in `debug`.

## 1.36.0
 - Fix support for mysql2 versions prior to 1.5.0
 - Read env vars by default to determine agent connection config

## 1.35.1
 - HTTPS exit spans can have the wrong protocol set.

## 1.35.0
 - Fix an async correlation issue caused by outgoing HTTP calls.
 - Do not enable tracing in Node.js v9
 - Limit maximum database statement length that is stored in spans.
 - MongoDB spans are nested in a wrong way.

## 1.34.1
 - Allow retrieval of TypeScipt and JSX files via the backchannel.

## 1.34.0
 - Call sequences are not recoded when using Redis.
 - Add `batch` (pipeline) support for Redis.

## 1.33.0
 - Add ioredis instrumentation.
 - Exclude `exec` call from Redis instrumentation sub commands.

## 1.32.0
 - Include details about uncaught errors in express handlers.

## 1.31.0
 - Add redis instrumentation.

## 1.30.3
 - HTTP tracing will report incorrect path in case of express.js router usage.

## 1.30.2
 - Support HTTPS server tracing.

## 1.30.1
 - Update `Server-Timing` response header in HTTP instrumentation to format of latest spec version.

## 1.30.0
 - Use MIT license.

## 1.29.0
 - MongoDB instrumentation tests fail intermittently
 - Add automatic mysql2 instrumentation

## 1.28.1
 - Node.js <=4.5.0 can have `Buffer.from`, but it does not accept a string.  Thanks @libozh!
 - Support announce to agent even when the Node.js process is renamed.
 - Update supported versions; checks & tests

## 1.28.0
 - Support automatic Node.js 8 tracing.

## 1.27.1
 - Add Request query capture & reporting.

## 1.27.0
 - HTTP client spans do not have the error count field `ec` set.
 - It must be possible to run in manual tracing mode only.
 - Support OpenTracing usage in Node.js 8.
 - Support service naming for OpenTracing traces.

## 1.26.8
 - Check for supported Node.js tracing versions marks v7 as unsupported.

## 1.26.7
 - Data transmission is broken in Node.js 0.12.

## 1.26.6
 - Encoding in communication between sensor and agent is only guaranteed via Node.js default opts.
 - Transmission of data to agents will fail whenever a character is being transmitted that needs more than one byte.

## 1.26.5
 - URL parsing results in measurable overhead in HTTP server tracing.

## 1.26.4
 - MongoDB tracing writes filter information into the wrong property.

## 1.26.3
 - Node.js v8 tracing is not yet possible. Automatically disable tracing when running within Node.js v8.

## 1.26.2
 - Parent handle in hooks is unused and can result in memory leaks.

## 1.26.1
 - OpenTracing is broken in version 0.14.0 and sensor support is incompatible.

## 1.26.0
 - Allow configuration of agent host address to support environments in which iptables or other networking tricks are used. Contributed by @lowsky. Thank you!
 - Upgrade opentracing to 0.14.0.

## 1.25.0
 - Support tracing for the mysql module.

## 1.24.0
 - Collect healthcheck results.

## 1.23.1
 - Support CPU profiling in Node.js >=7.0.0

## 1.23.0
 - Only publish the necessary runtime files.
 - Support scoped modules in dependency analysis.
 - Support the new OpenTracing span kinds `producer` and `consumer`.

## 1.22.0
 - Add additional meta data to the agent announce information to enable discovery in Kubernetes and CloudFoundry environments.

## 1.21.1
 - Remove duplicated HTTP metric gathering and reduce memory overhead.

## 1.21.0
 - Expose trace ID for root spans in `Server-Timing` header.

## 1.20.3
 - The Node.js tracing sensor on the agent side can be stopped. This will result in 404 errors which we should not log.

## 1.20.2
 - Upgrade event-loop-lag because of security vulnerabilities in its dependency tree. Contributed by @jamessharp. Thank you!

## 1.20.1
 - Source file retrieval is often broken. After discussions, we decided to relax the checks to only allow transmission of `*.js` files without validation of the location of the file.

## 1.20.0
 - Add kafka-node tracing support.

## 1.19.1
 - `getCurrentlyActiveInstanaSpanContext()` fails for modules which are using opentracing APIs while testing.

## 1.19.0
 - Remove development and documentation artifacts from NPM published module.
 - Execute tests against Node.js v7.
 - Add opentracing support.

## 1.18.0
 - Transport error counts in preparation for span batching logic.
 - Log fewer stacktraces when agent identification fails.

## 1.17.6
 - Strip matrix parameters and hash values from requests paths in addition to query parameters.

## 1.17.5
 - Allow user access to trace IDs as automatically for extended EUM support.
 - Stop setting cookies automatically for extended EUM support.

## 1.17.4
 - Disable extended EUM support by default.

## 1.17.3
 - Reported URLs for outgoing HTTP calls must include a `:` after the protocol name.

## 1.17.2
 - Add a `Path` directive for EUM cookies to support sub directory resource requests.

## 1.17.1
 - Use an `Expires` directive for EUM cookies to support IE<=8.

## 1.17.0
 - Expose trace ID via response cookie so it may be picked up for EUM tracing.

## 1.16.0
 - Enable tracing by default.

## 1.15.4
 - Never generate negative span IDs to avoid negative hex values.

## 1.15.3
 - Stringify Elasticsearch query to align with Java tracing implementation.

## 1.15.2
 - Allow retrieval of loaded modules and of other JS files located in the require path.

## 1.15.1
 - Allow retrieval of loaded modules via agent requests.
 - Fix name of command property in MongoDB spans.

## 1.15.0
 - Restrict CPU profiling support to Node.js >=4.0.0.
 - Differentiate between all the supported V8 garbage collection types.

## 1.14.0
 - Add on-demand CPU profiling support.

## 1.13.0
 - Add MongoDB tracing.

## 1.12.1
 - Format function name in stack traces as defined in the v8 Wiki.

## 1.12.0
 - Capture stack traces for exit spans.

## 1.11.0
 - Capture HTTP `Host` header on entry spans.

## 1.10.4
 - Maintenance: Avoid header casing questions by always transmitting uppercase header names.

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
