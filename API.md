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
// the Instana Node.js sensor.
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

// ...
```

## Ending Spans Manually (Message Broker Entries)

Instana's automated tracing handles everything for you for [supported libraries](https://docs.instana.io/ecosystem/node-js/#supported-versions), there is no need to interfere. There is one exception to this rule: Tracing operations that have been triggered by consuming a message from a message broker (Kafka, RabbitMQ). Since there is no notion of a response or reply when consuming a message from a message broker, there is no event that could tell the Instana Node.js sensor when all operations that are triggered by a particular message have been finished (in contrast to an incoming HTTP request, which always has an associated response, demarcating the end of the transaction).

The problem is that in contrast to other entry span types (HTTP requests for example) there is no notion of a response when receiving a message. When a process receives a new message from RabbitMQ, it will start an entry span. Instana's tracing capabilities need some event that signify that this span is finished. Other calls will only be assigned to the same trace when they are triggered between starting the entry span and finishing it.

Therefore, the application code needs to tell Instana when the processing of the incoming message is complete. For this purpose, a handle for the currently active span can be acquired with `instana.currentSpan()`. This handle offers two methods:

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
```

Note that the span will never be sent to the back end if you call `span.disableAutoEnd()` but forget to call `span.end()` on it.

Also note that for message brokers like Kafka and RabbitMQ, if you do not call `span.disableAutoEnd()` synchronously in your message handling function, the span will be ended and transmitted automatically _immediately_ after your message handling function has returned. This will break that trace, that is, operations (DB access, outgoing HTTP calls, sending other messages) executed while processing that message will not show up as calls in Instana.

There is no need to do any of this when _sending/publishing_ messages to a message broker.

## OpenTracing Integration

See [OpenTracing docs](README.md#opentracing).


