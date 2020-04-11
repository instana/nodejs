# Changelog

## Unreleased
- Support deployment scenario in which the whole application is installed from a registry via npm install instead of only its dependencies.

## 1.94.0
- [AWS Lambda] Fix stale timeout events on socket object induced by AWS Lambda runtime freezing and thawing the process.
- Support X-INSTANA-SYNTHETIC.

## 1.93.0
- Support tracing of deferred HTTP exits (that is, capture HTTP exits if the entry that triggered it has already finished).
- [AWS Lambda] Add support for INSTANA_DISABLE_CA_CHECK.

## 1.92.5
- [AWS Lambda] Reset `requestHasFailed` flag on start of Lambda handler.
- [AWS Lambda] Improve logging for data reporting timeouts.
- [AWS Lambda] Remove misleading "Traces and metrics have been sent to Instana." message.
- Remove deprecated span attributes `span.error` and `span.async`.
- Remove obsolete configuration option `config.agentName`/`INSTANA_AGENT_NAME`.

## 1.92.4
- [AWS Lambda] Do not try to send data to the Instana back end when a previous request to it has already failed.
- [AWS Lambda] Change span offloading intervall to 5 seconds.
- [AWS Lambda] Make sure that an uninstrumented https connection is used for span offloading.
- [AWS Lambda] Change layer name from `instana` to `instana-nodejs` to prepare for the extension of native AWS Lambda tracing to other runtimes.

## 1.92.3
- Always capture duration of GraphQL calls.
- Support `INSTANA_DEBUG` in native serverless tracing.

## 1.92.2
- Do not remove tags from lower priority spans when changing the span type (e.g. http -> graphql)

## 1.92.1
- Fix mongodb tracing for outdated versions of the mongodb package.

## 1.92.0
- Support for new website monitoring/mobile back end correlation via extended X-INSTANA-L header.
- Capture request and response headers on outgoing HTTP calls.

## 1.91.0
- Support for [W3C Trace Context](https://www.w3.org/TR/trace-context/).
- Fix: Annotate path templates (Express.js, Koa, Hapi, ...) and error messages (Express.js) on all HTTP entry spans, not only on root spans.

## 1.90.0
- Add API method to annotate spans with custom tags.

## 1.89.1
- Rewrite MongoDB instrumentation from scratch without using its APM API (which makes it hard to keep the trace context across async calls).

## 1.89.0
- Instrument [Apigee Microgateway/edgemicro's](https://www.npmjs.com/package/edgemicro) worker processes automatically when they are spawned.
- Provide an executable for static instrumentation of a globally installed [edgemicro](https://www.npmjs.com/package/edgemicro) CLI (see [our docs](https://docs.instana.io/ecosystem/node-js/edgemicro) for details).
- Keep asynchronous context across [memored](https://www.npmjs.com/package/memored) IPC communication gaps.

## 1.88.1
- [AWS Lambda] Replace intid value if it already exists in the Server-Timing header (in case the same result object is reused for multiple requests).

## 1.88.0
- Also support Winston 1.x and 2.x plus [`express-winston`](https://www.npmjs.com/package/express-winston) (in addition to Winston >= 3.x, which is already supported).

## 1.87.0
- Improve support for [Apollo Federation](https://www.apollographql.com/docs/apollo-server/federation/introduction/) by instrumenting [@apollo/gateway](https://www.npmjs.com/package/@apollo/gateway).
- Downgrade log level for missing package.json in potential depedency directory from info to debug.

## 1.86.0
- Add instrumentation for [pg-native](https://www.npmjs.com/package/pg-native) (`pg-native` is an alternative PostgreSQL driver package, in addition to the already supported [pg](https://www.npmjs.com/package/pg) package).

## 1.85.0
- [AWS Lambda] Reduce execution time penalty for native AWS Lambda tracing even further.
- Refactor agentready state to not use closures.

## 1.84.3
- [AWS Lambda] Avoid duplicated postHandler calls.

## 1.84.2
- [AWS Lambda] Call original callback in wrapped context.succeed/context.fail/context.done.
- Allow GraphQL tracing over other protocols in addition to HTTP.

## 1.84.1
- Also capture incoming HTTP calls that time out on the client side or are aborted on the server side (via `req.destroy()`).

## 1.84.0
- Add support for the [log4js](https://www.npmjs.com/package/log4js) logging package.
- [AWS Lambda]: Instrument deprecated legacy Lambda API (context.done, context.succeed, and context.fail).
- Fix stack trace capturing for Winston log calls.

## 1.83.0
- Add kafkajs instrumentation ([kafkajs](https://www.npmjs.com/package/kafkajs)).

## 1.82.1
- Trace MySql pool cluster calls.

## 1.82.0
- Capture synchronous errors in Lambda functions.
- Handle ARN correctly when a Lambda function is called via an alias.

## 1.81.1
- Fully cover Winston 3.x API surface.

## 1.81.0
- Provide access to Instana Node.js API via `@instana/aws-lambda`.
- Add instana.sdk.async alias for instana.sdk.promise.

## 1.80.0
- Add ability to disable individual tracers via `config.tracing.disabledTracers` or `INSTANA_DISABLED_TRACERS`.

## 1.79.1
- [AWS Lambda]: Cache target handler across invocations.

## 1.79.0
- Add auto-wrap package for AWS Lambda to enable Lambda tracing without code modification.

## 1.78.1
- Only use `X-Instana-Service` HTTP header when agent is configured to capture it.

## 1.78.0
- Support `INSTANA_SERVICE_NAME`/`config.serviceName` for auto-tracing and SDK spans. Previously, this has only been supported for OpenTracing spans.
- Support `X-Instana-Service` HTTP header.

## 1.77.0
- [AWS Lambda]: Inject EUM back end correlation header in AWS Lambda responses if possible.

## 1.76.0
- Do not add tracing headers to signed aws-sdk HTTP requests.
- Extract serverless utilities that are not specific to the AWS Lambda platform into their own utility package, @instana/serverless.
- Log a warning when @instana/collector has been initialized too late. Additionally, this will be transmitted as snapshot data.

## 1.75.0
- Capture HTTP response headers for HTTP entry spans.

## 1.74.2
- [AWS Lambda]: Support new environment variables `INSTANA_ENDPOINT_URL` and `INSTANA_AGENT_KEY` in addition to the now deprecated variables `INSTANA_URL` and `INSTANA_KEY`.

## 1.74.1
- [AWS Lambda]: Improve logging.

## 1.74.0
- [AWS Lambda]: In-process data collection for AWS Lambdas via new package @instana/aws-lambda (beta).

## 1.73.2
- Move some metrics from core to collector package.

## 1.73.1
- Fix cases where GraphQL tracing would break when another non-HTTP entry span is already active.

## 1.73.0
- Allow early init of instrumentations (experimental).

## 1.72.1
- Improve announce cycle by polling for the "agent ready" state once a second, this will bring the delay from "announce" to "agent ready" down from 10 to ~1 seconds for the majority of cases (in particular with the improved agent to be released soon).
- Enforce minimum delay of one second between sending snapshot data and the first spans.

## 1.72.0
- Add NATS.io instrumentation ([nats](https://www.npmjs.com/package/nats)).
- Add NATS streaming instrumentation ([node-nats-streaming](https://www.npmjs.com/package/node-nats-streaming)).

## 1.71.3
- Fix: Add MongoDB command details for update, replace and delete operations.

## 1.71.2
- Avoid triggering fastify's `basePath` deprecation warning.

## 1.71.1
- Remove overaggressive validation warning for HTTP spans.

## 1.71.0
- Add support for kafka-node >= 4.0.0.
- Bunyan: support for capturing the error message from a nested error object (attribute `err`) given in the fields argument.

## 1.70.0
- Enable uncaught exception reporting in Node 12.x.

## 1.69.2
- Fix cases where span.ec would be overwritten by http server instrumentation.

## 1.69.1
- Trace through graphql-subscriptions PubSub/AsyncIterator.
- Add missing cls.ns.exit calls in mongodb instrumentation (fix for leaking `cls.ns._set` entries).

## 1.69.0
- Add graphql instrumentation ([graphql](https://www.npmjs.com/package/graphql)).

## 1.68.4
- Require `cls-bluebird` before installing the require hook for `bluebird` so client code can use `cls-bluebird` without conflicts ([#152](https://github.com/instana/nodejs-sensor/pull/152), thanks to @jonathansamines).
- Fix tracing of `https` client calls in Node.js 8.9.0.

## 1.68.3
- Add additional check to `requireHook` in case other modules interfering with `require` (like `require-in-the-middle`) are present.

## 1.68.2
- Remove circular references from span data before serializing it ([#148](https://github.com/instana/nodejs-sensor/pull/148), thanks to @sklose).

## 1.68.1
- Log a warning instead of info when running an unsupported Node.js version.

## 1.68.0
- Improve configuration handling, support more environment variables.
- Record [hapi.js](https://hapijs.com/) routes as path templates when tracing HTTP entries.
- Fix wrong warnings in validation for entry spans (that no other span is already in progress) for HTTP(s) entries.

## 1.67.2
- Read X-INSTANA-... headers case-insensitive in amqp instrumentation.
- Fix handling of Fastify routes with an beforeHandler array.

## 1.67.1
- Fix: Handle koa routes defined by regular expressions.

## 1.67.0
- Add support for Node.js 12 (except for two optional features that rely on native addons which are not yet available for Node.js 12, CPU profiling and reporting uncaught exceptions).

## 1.66.0
- Report unhandled promise rejections as issues (disabled by default, see [configuration guide](https://github.com/instana/nodejs-sensor/blob/master/packages/collector/CONFIGURATION.md#reporting-unhandled-promise-rejections)).

## 1.65.1
- Fix: Init metrics correctly when no config is passed ([#138](https://github.com/instana/nodejs-sensor/issues/138)).
- Add data.rpc.host and data.rpc.port to GRPC exits to improve service discovery.

## 1.65.0
- Rename the npm package from instana-nodejs-sensor to @instana/collector. See [migration guide](https://github.com/instana/nodejs-sensor/blob/master/packages/collector/README.md#migrating-from-instana-nodejs-sensor-to-instanacollector) for details.
- Split into @instana/core and @instana/collector.
- Fix trace context continuity when multiple instances of `bluebird` are present.

## 1.64.0
- Add tracing SDK to create spans manually, integrating seamlessly with automatic tracing - see [SDK API documentation](https://github.com/instana/nodejs-sensor/blob/master/packages/collector/API.md#creating-spans-manually-with-the-sdk) for details.
- Additional validation for entry spans (that no other span is already in progress).

## 1.63.2
- Remove deprecated span attribute span.b.u (redis, ioredis).

## 1.63.1
- Fix: Set GRPC headers instead of adding them.

## 1.63.0
- Limit content length of requests when talking to the agent.
- Fix: Handle non-pooled pg queries using the promise API correctly.

## 1.62.0
- Extend API: Offer various getters to inquire about details of the currently actice span (trace ID, span ID and other attributes).
- Improve generated IDs (span ID, trace ID).
- Fix: Make sure timeouts created by instana-nodejs-sensor do not prevent the process from terminating.

## 1.61.2
- Fix for GRPC instrumentation: Add original attributes to shimmed client method.

## 1.61.1
- Fix: Add missing instrumentation hooks for mysql/mysql2#execute.

## 1.61.0
- Accept values of type string for config.tracing.stackTraceLength.

## 1.60.3
- Fix an issue in the GRPC instrumentation when an options object is provided.

## 1.60.2
- Fix duplicated cls binds in postgres and mssql instrumentation.

## 1.60.1
- Fix error when a Pino logger was passed via config (#119).

## 1.60.0
- Instrument Elasticsearch operations msearch and mget ([#117](https://github.com/instana/nodejs-sensor/pull/117), thanks to @DtRWoS).

## 1.59.0
- Add GRPC instrumentation ([grpc](https://www.npmjs.com/package/grpc)).

## 1.58.0
- Support Node.js 11.

## 1.57.0
- Provide an API to set a logger after initialization to resolve init/logger cycle.

## 1.56.0
- Record [koa-router](https://github.com/alexmingoia/koa-router) routes as path templates when tracing HTTP entries.
- Improve announce payload.
- Left pad generated IDs with '0'.

## 1.55.2
- Fix: Add HTTP query params for HTTP exits.
- Fix: Do not capture HTTP headers for HTTP exits (only for entries).
- Fix: Capture erroneous span on synchronous exceptions in HTTP client (like malformed URL).

## 1.55.1
- Fix method name of NoopSpanHandle.

## 1.55.0
- Provide API to end spans manually to allow capturing of child exit spans for message consumers (RabbitMQ/amqplib, Kafka).

## 1.54.2
- Fix broken trace context in some MongoDB usage scenarios.

## 1.54.1
- RabbitMQ/amqplib: Small fix for TLS AMQP Urls (amqps).

## 1.54.0
- Instrument [Bunyan](https://github.com/trentm/node-bunyan).
- Pino: Improve tracing for error objects.

## 1.53.0
- Instrument [Winston](https://github.com/winstonjs/winston).
- Exclude file system entries that are not directories in dependency analysis, fixes confusing warning.

## 1.52.0
- Instrument [Pino](http://getpino.io/).
- Allow other (non-Bunyan) loggers to be injected ([#88](https://github.com/instana/nodejs-sensor/pull/88), thanks to @SerayaEryn).

## 1.51.0
- Instrument amqplib (RabbitMQ tracing).

## 1.50.1
- Fix: Do not attach context to error/exception objects (#90).

## 1.50.0
- Update to latest emitter-listener package to include [latest fix](https://github.com/othiym23/emitter-listener/pull/6).
- Update a number of dependencies (bunyan, event-loop-lag, opentracing, shimmer, ...).
- Fix minor issues reported by npm audit.

## 1.49.1
- Fix: Do not fail when http client options object has a headers attribute with value.

## 1.49.0
- Enable CPU profiling for Node.js 10 apps.
- Warn about missing dependency netlinkwrapper at startup when reporting of uncaught exceptions is enabled.
- Fix: Uncaught exception reporting can now be enabled on systems using musl libc instead of glibc (e.g. Alpine Linux).

## 1.48.1
- Fix secret scrubbing for HTTP server instrumentation.

## 1.48.0
- Various fixes and improvements for the HTTP client instrumentation:
    - support for http(s).request(url, options, callback) API introduced in Node.js 10.9.0,
    - support for WHATWG URL objects,
    - fix for requests with header "Expect: 100-continue", and
    - instrument http.get and https.get separately from http(s).request.

## 1.47.1
- MySQL: Fix for MySQL instrumentation sometimes losing the tracing context.

## 1.47.0
- Add MSSQL (Microsoft SQL Server) instrumentation (supports [mssql](https://www.npmjs.com/package/mssql), version >= 4 via [tedious driver](https://www.npmjs.com/package/tedious)).
- Tracing support for [mongodb](https://www.npmjs.com/package/mongodb) version >= 3.0.6.

## 1.46.0
- Support a wider range of command names for identification of PID in parent PID namespace.
- Report uncaught exceptions as incidents and via span/trace (disabled by default).

## 1.45.0
- Record `https` client calls.

## 1.44.2
- Fix result handling in PostgreSQL instrumentation.

## 1.44.1
- Do not break when modules use `stealthy-require` or similar mechanisms.

## 1.44.0
- Record fastify path templates when tracing HTTP entries.

## 1.43.0
- Record express.js path templates when tracing HTTP entries.

## 1.42.0
- Expose a debugging action to learn about loaded modules.
- Allow retrieval of `package.json` files.

## 1.41.0
- Add PostgreSQL instrumentation ([pg](https://www.npmjs.com/package/pg)).

## 1.40.2
- Avoid sending batch size 0 for Redis multi commands.

## 1.40.1
- Only try to instrument bluebird if it is actually available.

## 1.40.0
- Include additional debugging data in log when data transmission to agent fails.
- Support recording of user-configurable HTTP headers in HTTP client and server instrumentation.

## 1.39.0
- Include reporting PID in agent logs.

## 1.38.3
- Protect spans from accidental retransmission.
- Abort HTTP requests to the agent on timeouts.
- HTTP client instrumentation does not correctly interpret HTTP client timeouts.

## 1.38.2
- ioredis: Correctly manage tracing context in ioredis instrumentation.

## 1.38.1
- OpenTracing baggage is not defined on span context when using `getCurrentlyActiveInstanaSpanContext`.

## 1.38.0
- Enable tracing in Node.js `^10.0.0`.
- Regression in MongoDB instrumentation which attempts to access optional `operationId` properties.

## 1.37.3
- Prepare support for 128bit trace IDs.
- Reduce memory footprint when using HTTP agents with `maxSockets: Infinity`.

## 1.37.2
- MongoDB: Properly initialize and assure operationId is generated.

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
- Fix support for mysql2 versions prior to 1.5.0.
- Read env vars by default to determine agent connection config.

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
- Node.js <=4.5.0 can have `Buffer.from`, but it does not accept a string. Thanks @libozh!
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
