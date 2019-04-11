# API

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Instana's Init Function](#instanas-init-function)
- [Accessing Other Exports](#accessing-other-exports)
- [Setting the Logger After Initialization](#setting-the-logger-after-initialization)
- [Accessing The Currently Active Span](#accessing-the-currently-active-span)
  - [Ending Spans Manually (Message Broker Entries)](#ending-spans-manually-message-broker-entries)
- [Creating Spans Manually With The SDK](#creating-spans-manually-with-the-sdk)
  - [Terminology](#terminology)
  - [Callback API vs. Promise API](#callback-api-vs-promise-api)
  - [API Methods](#api-methods)
  - [Handling Event Emitters](#handling-event-emitters)
- [OpenTracing Integration](#opentracing-integration)
  - [Limitations](#limitations)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Instana's Init Function

`require('@instana/collector')` will return a function that needs to be called to initialize the Instana Node.js collector. You only need to call this function once, but you should do so at the very beginning of the process, before any other `require` statements and before executing any other code.

```javascript
require('@instana/collector')();
```

The initialization function will return a reference to itself, which is relevant if you want to access other exports provided by the Instana Node.js collector. That is, the following two snippets are equivalent:

```javascript
const instana = require('@instana/collector')();
```
is the same as:
```javascript
const instana = require('@instana/collector');
instana();
```

The initialization function accepts one optional parameter, a configuration object:

```javascript
const instana = require('@instana/collector')({
  // ... configuration object, see configuration documentation
});
```

See [configuration docs](CONFIGURATION.md) for details on the configuration object.

See [usage documentation](README.md#installation-and-usage) for more details on installing and initializing the Instana Node.js collector.

## Accessing Other Exports

Almost all applications will only ever need to initialize Instana as demonstrated above. However, there are a few cases in which you might need to access other parts of the Instana API.

```javascript
// At the start of your main module/application entry point, the function
// returned by require('@instana/collector') needs to be called to initialize
// the Instana Node.js collector. This needs to happen before anything else is
// required or imported.
const instana = require('@instana/collector')();

...

// In other modules, you can get a reference to the Instana API by simply
// requiring it again (without calling the function returned by the import).
const instana = require('@instana/collector');

...

// Use the instana reference acquired by the require statement to access its
// API, for example:
instana.setLogger(...);

// or:
instana.currentSpan();

// or:
instana.sdk.callback.startEntrySpan('custom-span', () => { ... });

// or:
instana.opentracing.createTracer();

// ...
```

## Setting the Logger After Initialization

As mentioned before, you need to call the initialization function (which is returned by `require('@instana/collector')`) immediately, before requiring/importing any other packages, otherwise Instana's automatic tracing will only work partially. In particular, this requires you to initialize Instana before requiring your logging package (for example, `bunyan`). If you require the logging package before initializing Instana, you will not see log messages in Instana. On the other hand, you might want to pass your own logger to Instana's initialization function (see [configuration docs](CONFIGURATION.md#logging)). To resolve this cyclic dependency, the `@instana/collector` offers the function `setLogger` to initialize Instana without a custom logger first and then set the logger later.

To give a concrete exampe, the following is _not_ supported:

```javascript
// WRONG
const instana = require('@instana/collector');

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
const instana = require('@instana/collector')();

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

Nevertheless, application code is granted limited read only access to the the collector's internal state. For this purpose, a handle for the currently active span can be acquired with `instana.currentSpan()`. This method will return a dummy handle when no span is currently active. A span handle returned by this method offers the following methods:

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

We mentioned before that Instana's automated tracing handles everything for you for [supported libraries](https://docs.instana.io/ecosystem/node-js/#supported-versions) and that there is no need to interfere. There is one small exception to this rule: Tracing operations that have been triggered by consuming a message from a message broker (Kafka, RabbitMQ). Since there is no notion of a response or reply when consuming a message from a message broker, there is no event that could tell the Instana Node.js collector when all operations that are triggered by a particular message have been finished (in contrast to an incoming HTTP request, which always has an associated response, demarcating the end of the transaction).

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

## Creating Spans Manually With The SDK

The collector automatically instruments widely used APIs to add tracing support that simply works out of the box. Sometimes you may find that this is not enough. The SDK can be used to provide insights into areas of your applications, e.g. custom libraries and frameworks, which would otherwise go unnoticed. For this purpose, the SDK allows you to create spans manually. Another use case is to create _intermediate_ spans to demarcate sections of interest in your code.

Spans created with the SDK integrate seamlessly with Instana's automatic tracing capabilities.

### Terminology

The SDK provides functions to create entry spans, intermediate spans and exit spans. In short:

* Entry spans represent calls _into_ the application under monitoring. These could be HTTP requests that the application _receives_ from other services or messages the application picks up from a queue. (Of course, HTTP requests are already covered by automatic tracing.)
* Exit spans represent calls the application makes. These could be HTTP requests the application _makes_ (and which are responded to by other services) or database calls. (Again, outgoing HTTP requests and a lot of popular databases are already covered by automatic instrumentation.)
* Intermediate spans are things that happen _inside_ the application under monitoring, that is, they neither enter nor leave the process as entry spans and exit spans do. Intermediate spans can also be used to wrap automatically created spans in case you want to provide additional attributes (called _tags_) which the automatical instrumentation does not provide.

For more details on the terminology and, in particular, how _spans_ relate to the _calls_ you will see in the Instana UI, refer to our [documentation](https://docs.instana.io/core_concepts/tracing/#terminology).

There is also a section on [tracing best practices](https://docs.instana.io/quick_start/custom_tracing/#tips--best-practices) that is worth reading before starting to implement custom tracing with the SDK.

### Callback API vs. Promise API

The SDK offers two different type of APIs, one callback based (`instana.sdk.callback`) and one promise based (`instana.sdk.promise`). Which one is used is purely a matter of taste. Basically, both APIs offer various methods for _starting_  a span and for _completing_ spans. You need to _start_ the span directly before you do the work that you want the span to represent and _complete_ the span once the work is finished.

When using the callback API, you need to pass a callback whenever you start a new span and do all the work associated with that span inside that callback (or in the callback of any asynchronous operation transitively triggered from that callback). Here is an example:

```javascript
instana.sdk.callback.startEntrySpan('my-custom-span', () => {
  // The actual work needs to happen inside this callback (or in the callback
  // of any asynchronous operation transitively triggered from this callback).
  ...
  doSomethingAsynchronous((err, result) => {
    if (err) {
      instana.sdk.callback.completeEntrySpan(err);
      logger.error(err);
      return;
    }
    instana.sdk.callback.completeEntrySpan();
    logger.info('Yay! 🎉', result);
  });
});
```

Note that the callback provided to `startXxxSpan` is called immediately and synchronously, without arguments. Other asynchronous operations can be triggered inside that callback.

When using the promise API, all methods that start a new span will return a promise. All the work associated with that span needs to happen in that promise chain (that is, either in the `then` of the promise returned by `startXxxSpan` or in any `then` handler further down the promise chain). Here is an example:

```javascript
instana.sdk.promise.startEntrySpan('my-custom-span').then(() => {
  // The actual work needs to happen inside the promise chain, that is, either
  // here or in any `then` handler further down the promise chain.
  return anotherPromise();
}).then(result => {
  instana.sdk.promise.completeEntrySpan();
  logger.info('Yay! 🎉', result);
}).catch(err => {
  instana.sdk.promise.completeEntrySpan(err);
  logger.error(err);
});
```

Note that the promise returned by `startXxxSpan` is never rejected, it will resolve immediately without a value. Other asynchronous operations can be triggered inside its `then` handler.

The `completeXxxSpan` methods are identical for both the callback and the promise API.

### API Methods

The following *common parameters* are accepted by the SDK's methods:

* `name`: The name of the span. This parameter is mandatory when starting a new span. It should be a short and self explanatory string.
* `tags`: An optional JS object of additional meta data for the span. You can provide tags when starting the span or when completing it, or both. If you provide tags when starting and when completing the span, both objects will be merged. The tags will be shown in the Instana UI. You need to make sure to not add arbitrarily large objects to the spans you create. Short key value pairs should be used. If spans get too big, a batch of spans might get dropped instead of being sent to the Instana agent.
* `error`: When an error occured while doing the work associated with the current span, this error can be attached to the span when completing it.
* `traceId`: This is only relevant for entry spans and is used to make the entry span part of an existing trace that has already been started in another process. If you provide a `traceId`, you also need to provide a `parentSpanId`.
* `parentSpanId`: This is only relevant for entry spans that are part of an existing trace that has already been started in another process. It is used to reference the exit span that triggered this entry span. If you provide a `parentSpanId`, you also need to provide a `traceId`.

The following *methods* are offered by both APIs:

* `instana.sdk.callback.startEntrySpan(name [, tags[, traceId, parentSpanId]], callback)`,<br>
`instana.sdk.promise.startEntrySpan(name [, tags[, traceId, parentSpanId]])`:<br>
Starts an entry span. You need to provide a `name` for the span. You can optionally provide a `tags` object. The `traceId`, and `parentSpanId` are also optional but you need to provide either both IDs or no ID at all.
* `instana.sdk.callback.completeEntrySpan([error, tags])`,<br>
`instana.sdk.promise.completeEntrySpan([error, tags])`:<br>
Finishes an entry span. An error and additional tags can be provided. If you want to provide additional tags but no error, pass `null` as the first argument.
* `instana.sdk.callback.startIntermediateSpan(name[, tags], callback)`,<br>
`instana.sdk.promise.startIntermediateSpan(name[, tags])`:<br>
Starts an intermediate span. You need to provide a `name` for the span and you can optionally provide a `tags` object.
* `instana.sdk.callback.completeIntermediateSpan([error, tags])`,<br>
`instana.sdk.promise.completeIntermediateSpan([error, tags])`:<br>
Finishes an intermediate span. An error and additional tags can be provided. If you want to provide additional tags but no error, pass `null` as the first argument.
* `instana.sdk.callback.startExitSpan(name[, tags], callback)`<br>,
`instana.sdk.promise.startExitSpan(name[, tags])`:<br>
Starts an exit span. You need to provide a `name` for the span and you can optionally provide a `tags` object.
* `instana.sdk.callback.completeExitSpan([error, tags])`<br>,
`instana.sdk.promise.completeExitSpan([error, tags])`:<br>
Finishes an exit span. An error and additional tags can be provided. If you want to provide additional tags but no error, pass `null` as the first argument.
* `instana.sdk.callback.bindEmitter(emitter)`,<br>
`instana.sdk.promise.bindEmitter(emitter)`:<br>
See [below](#handling-event-emitters).

Note that spans started with any `startXxxSpan` method will only be transmitted to Instana once the corresponding `completeXxxSpan` has been called. Also, for nested spans, the calls need to be in the right order.

To illustrate this, conside the following two examples. The following is valid:

```javascript
const sdk = instana.sdk.callback;

sdk.startEntrySpan('my-custom-entry', () => {
  doSomethingAsynchronous(() => {
    sdk.startExitSpan('my-custom-exit', () => {
      doAnotherThingAsynchronous(() => {
        sdk.completeExitSpan();
        sdk.completeEntrySpan();
        logger.info('Yay! 🎉');
      });
    });
  });
});
```

But this is not valid:

```javascript
const sdk = instana.sdk.callback;

sdk.startEntrySpan('my-custom-entry', () => {
  doSomethingAsynchronous(() => {
    sdk.startExitSpan('my-custom-exit', () => {
      doAnotherThingAsynchronous(() => {
        // WRONG ORDER - you first need to complete the span you started last.
        // Think of the spans as stack.
        sdk.completeEntrySpan();
        sdk.completeExitSpan();
        logger.info('Yay! 🎉');
      });
    });
  });
});
```

Care must also be taken when nesting spans with the promise API. The following is correct:

```javascript
instana.sdk.promise.startEntrySpan('custom-entry')
  // any number of other promises/async operations
  .then(() => {
    ...
  })
  .then(() => {
    return instana.sdk.promise.startExitSpan('custom-exit')
      // any number of other promises/async operations associated with the exit span
      .then(() => {
        ...
      })
      .then(() => {
        // Important: The exit span needs to be completed in the promise chain
        // started with startExitSpan, not in the outer promise chain started
        // with startEntrySpan.
        instana.sdk.promise.completeExitSpan();
      });
  })
  .then(() => {
    instana.sdk.promise.completeEntrySpan();
    logger.info('Yay! 🎉');
  });
```

But this will not work:

```javascript
instana.sdk.promise.startEntrySpan('custom-entry')
.then(() => {
  return instana.sdk.promise.startExitSpan('custom-exit');
})
.then(() => {
  // WRONG The currently active span in this context is the *entry* span, not
  // the exit span, so it is not possible to complete the exit span here.
  instana.sdk.promise.completeExitSpan();
  instana.sdk.promise.completeEntrySpan();
});
```

At this point you might wonder why the SDK's API is designed this way, in particular the business with the `startXxxSpan` methods accepting a callback/returning a promise might seem awkward. The point is that the we need to keep the asynchronous context while tracing. Since Node.js is single threaded and uses callbacks to do asynchronous operations, the Node.js collector needs a way to determine which operations belong to which span - wrapping the traced action in a callback or a promise makes that possible.

### Handling Event Emitters

If the work associated with your custom SDK span involves an [event emitter](https://nodejs.org/api/events.html#events_class_eventemitter) and if the code running inside the span listens to emitted events you need to _bind_ the event emitter, otherwise your tracing code will not behave as expected. Here is how:

```javascript
instana.sdk.callback.startEntrySpan('custom-span', () => {
  const emitter = ... // some event emitter
  instana.sdk.callback.bindEmitter(emitter);
  ...
  emitter.on('some-event', () => {
    instana.sdk.callback.completeEntrySpan();
    logger.info('Done! 🎉');
  });
});
```

## OpenTracing Integration

This package also implements the OpenTracing API. In order to use OpenTracing for Node.js with Instana, you should [disable automatic tracing](CONFIGURATION.md#disabling-automatic-tracing) and use the Instana OpenTracing API implementation. The following sample project shows how this is done:

```javascript
// Always initialize the collector as the first module inside the application.
const instana = require('@instana/collector')({
  tracing: {
    disableAutomaticTracing: true
  }
});

const opentracing = require('opentracing');

// optionally use the opentracing provided singleton tracer wrapper
opentracing.initGlobalTracer(instana.opentracing.createTracer());

// retrieve the tracer instance from the opentracing tracer wrapper
const tracer = opentracing.globalTracer();

// start a new trace with an operation name
const span = tracer.startSpan('auth');

// mark operation as failed
span.setTag(opentracing.Tags.ERROR, true);

// finish the span and schedule it for transmission to instana
span.finish();
```

### Limitations

* OpenTracing is not integrated with Instana's automatic tracing. In particular, spans created by using the OpenTracing API will not be part of the same trace as the spans created by our automatic tracing instrumentation. If you want to add _additional_ spans to the automatically created spans, you should prefer the [SDK](#creating-spans-manually-with-the-sdk) over OpenTracing. In fact, we recommend to either use automatic tracing (optionally augmented by SDK spans) or OpenTracing, but not both in one application.
* The Instana Node.js collector does not have support for OpenTracing binary carriers. This OpenTracing implementation will silently ignore OpenTracing binary carrier objects.
* Care should also be taken with OpenTracing baggage items. Baggage items are meta data which is transported via carrier objects across network boundaries. Furthermore, this meta data is inherited by child spans (and their child spans…). This can produce some overhead. We recommend to completely avoid the OpenTracing baggage API.

