# API

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Instana's Init Function](#instanas-init-function)
- [Accessing Other Exports](#accessing-other-exports)
- [Ending Spans Manually (Message Broker Entries)](#ending-spans-manually-message-broker-entries)
- [OpenTracing Integration](#opentracing-integration)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Instana's Init Function

`require('instana-nodejs-sensor')` will return a function that needs to be called to initialize the Instana Node.js sensor. You only need to call this function once, but you should do so at the very beginning of the process, before any other `require` statements and before executing any other code.

```javascript
require('instana-nodejs-sensor')();
```

The initialization function will return a reference to itself, which is relevant if you want to access other exports provided by the Instana Node.js sensor. That is, the following two snippets are equivalent:

```javascript
const instana = require('instana-nodejs-sensor')();
```
is the same as:
```javascript
const instana = require('instana-nodejs-sensor');
instana();
```

The initialization function accepts one optional parameter, a configuration object:

```javascript
const instana = require('instana-nodejs-sensor')({
  // ... configuration object, see configuration documentation
});
```

See [configuration docs](CONFIGURATION.md) for details on the configuration object.

See [usage documentation](README.md#installation-and-usage) for more details on installing and initializing the Instana Node.js sensor.

## Accessing Other Exports

Almost all applications will only ever need to initialize Instana as demonstrated above. However, there are a few cases in which you might need to access other parts of the Instana API.

```javascript
// At the start of your main module/application entry point, the function
// returned by require('instana-nodejs-sensor') needs to be called to initialize
// the Instana Node.js sensor. This needs to happen before anything else is
// required or imported.
const instana = require('instana-nodejs-sensor')();

...

// In other modules, you can get a reference to the Instana API by simply
// requiring it again (without calling the function returned by the import).
const instana = require('instana-nodejs-sensor');

...

// Use the instana reference acquired by the require statement to access its
// API, for example:
instana.opentracing.createTracer();

// or:
instana.currentSpan();

// or:
instana.setLogger(...);

// ...
```

## Setting the Logger After Initialization

As mentioned before, you need to call the initialization function (which is returned by `require('instana-nodejs-sensor')`) immediately, before requiring/importing any other packages, otherwise Instana's automatic tracing will only work partially. In particular, this requires you to initialize Instana before requiring your logging package (for example, `bunyan`). If you require the logging package before initializing Instana, you will not see log messages in Instana. On the other hand, you might want to pass your own logger to Instana's initialization function (see [configuration docs](CONFIGURATION.md#logging). To resolve this cyclic dependency, the `instana-nodejs-sensor` offers the function `setLogger` to initialize Instana without a custom logger first and then set the logger later.

To give a concrete exampe, the following is _not_ supported:

```javascript
// WRONG
const instana = require('instana-nodejs-sensor');

// The bunyan package will not be instrumented by Instana, because it is
// required *before* Instana has been initialized.
const bunyan = require('bunyan');
const logger = bunyan.createLogger(...);

// Now Instana is initialized, after the logging package has already been
// required. This is too late!
instana({ logger: logger }); // TOO LATE!
```

Instead, initialize Instana first, without a logger, before requiring anything else. Then set the logger that Instana should use later, when the logger has been required and initialized:

```javascript
// Correct: Call the initialization function immediately.
// (Pay attention to the extra pair of parantheses at the end of the line.)
const instana = require('instana-nodejs-sensor')();

// Require and initialize your logging package.
const bunyan = require('bunyan');
// Create your logger(s).
const logger = bunyan.createLogger(...);
// Set the logger Instana should use.
instana.setLogger(logger);
```

The first few lines of log output from Instana (during the initialization procedure) will be logged with Instana's default bunyan logger, but everything after the `instana.setLogger(logger)` call will be logged with the logger you have set. Plus, your application's log output will show up in the "log messages" tab in Instana's dashboards correctly (note that we only show log calls for which the severity is at least "WARN").

## Accessing The Currently Active Span

Instana's automated tracing handles everything for you for [supported libraries](https://docs.instana.io/ecosystem/node-js/#supported-versions), there is no need to interfere.

Nevertheless, application code is granted limited read only access to the the sensor's internal state. For this purpose, a handle for the currently active span can be acquired with `instana.currentSpan()`. This method will return a dummy handle when no span is currently active. A span handle returned by this method offers the following methods:

`span.getTraceId()`: Returns the trace ID of the span.

`span.getSpanId()`: Returns the span ID of the span.

`span.getParentSpanId()`: Returns the parent span ID of the span.

`span.getName()`: Returns the name of the span.

`span.isEntrySpan()`: Determine if the span is an entry span (server span).

`span.isExitSpan()`: Determine if the span is an exit span (client span).

`span.isIntermediateSpan()`: Determine if the span is an intermediate span (local span).

`span.getTimestamp()`: Returns the timestamp of the span's start.

`span.getDuration()`: Returns the duration of the span. This method will return 0 if the span has not been completed yet. Note that this is almost always the case as `instana.currentSpan()` returns the currently active span, which, by definition, has not been completed. This will only return a duration greater than 0 if `span.disableAutoEnd()` and `span.end()` have been used (see below).

`span.getErrorCount()`: Returns the number of errors that have occured during the processing of the request associated with the currently active span. This method will return 0 in most cases if the span has not been completed yet. This is almost always the case as `instana.currentSpan()` returns the currently active span, which, by definition, has not been completed. This will return a value greater than 0 if `span.disableAutoEnd()` and `span.end(errorCount)` have been used (see below).

`span.disableAutoEnd()`: See [next section](#ending-spans-manually-message-broker-entries).

`span.end(errorCount)`: See [next section](#ending-spans-manually-message-broker-entries).

### Ending Spans Manually (Message Broker Entries)

We mentioned before that Instana's automated tracing handles everything for you for [supported libraries](https://docs.instana.io/ecosystem/node-js/#supported-versions) and that there is no need to interfere. There is one small exception to this rule: Tracing operations that have been triggered by consuming a message from a message broker (Kafka, RabbitMQ). Since there is no notion of a response or reply when consuming a message from a message broker, there is no event that could tell the Instana Node.js sensor when all operations that are triggered by a particular message have been finished (in contrast to an incoming HTTP request, which always has an associated response, demarcating the end of the transaction).

The problem is that in contrast to other entry span types (HTTP requests for example) there is no notion of a response when receiving a message. When a process receives a new message from RabbitMQ, it will start an entry span. Instana's tracing capabilities need some event that signify that this span is finished. Other calls will only be assigned to the same trace when they are triggered between starting the entry span and finishing it.

Therefore, the application code needs to tell Instana when the processing of the incoming message is complete. For this purpose, the handle for the currently active span which can be acquired with `instana.currentSpan()` (see above) can be used. The handle offers two methods that are relevant for this use case:

`span.disableAutoEnd()`: Disables automatically finishing the span and marks this span as one that will be finished manually by calling `span.end()` later.

`span.end(errorCount)`: Finishes a span on which `span.disableAutoEnd()` has been called earlier. The `errorCount` argument is optional. Pass `1` if an error happend while processing the message. If nothing is passed, the `errorCount` defaults to 0.

Here is an example how this looks like for RabbitMQ:

```javascript
channel.consume(queueName, function(msg) {
  var span = instana.currentSpan();
  span.disableAutoEnd();

  // The setTimeout is a placeholder for any number of asynchronous operations
  // that are executed when processing this particular message. It could also be
  // database access calls or outgoing HTTP calls or really anything else.
  setTimeout(function() {

    // call span.end when processing of the incoming message has finshed. Make
    // sure to also call in case an error happens while processing the message.
    span.end();

  }, 5000);
});
```

Note that the span will never be sent to the back end if you call `span.disableAutoEnd()` but forget to call `span.end()` on it.

Also note that for message brokers like Kafka and RabbitMQ, if you do not call `span.disableAutoEnd()` synchronously in your message handling function, the span will be ended and transmitted automatically _immediately_ after your message handling function has returned. This will break that trace, that is, operations (DB access, outgoing HTTP calls, sending other messages) executed while processing that message will not show up as calls in Instana.

There is no need to do any of this when _sending/publishing_ messages to a message broker.

## OpenTracing Integration

See [OpenTracing docs](README.md#opentracing).

