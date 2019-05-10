# Configuration

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Tracing](#tracing)
  - [Disabling Automatic Tracing](#disabling-automatic-tracing)
  - [Capturing Stack Traces](#capturing-stack-traces)
  - [SDK/OpenTracing Service Naming](#sdkopentracing-service-naming)
- [Reporting Uncaught Exceptions](#reporting-uncaught-exceptions)
- [Reporting Unhandled Promise Rejections](#reporting-unhandled-promise-rejections)
- [Logging](#logging)
  - [Bunyan Parent Logger](#bunyan-parent-logger)
  - [Log Level Configuration](#log-level-configuration)
- [Agent Communication](#agent-communication)
  - [Agent Host](#agent-host)
  - [Agent Port](#agent-port)
  - [Agent Name](#agent-name)
  - [Kubernetes](#kubernetes)
- [Full Configuration Reference](#full-configuration-reference)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Tracing
The tracing feature is enabled by default. To disable it, pass the following option to the initialization function.

```javascript
require('@instana/collector')({
  tracing: {
    enabled: false
  }
});
```

You can also disable tracing by setting the environment variable `INSTANA_DISABLE_TRACING=true`.

When tracing is disabled, you can neither use the trace SDK nor the OpenTracing API, and automatic tracing will also be disabled.

### Disabling Automatic Tracing
Automatic tracing is enabled by default. To disable it, pass the following option to the initialization function.

```javascript
require('@instana/collector')({
  tracing: {
    automaticTracingEnabled: false
  }
});
```

The Node.js collector also still supports the previous name of this property:

```javascript
require('@instana/collector')({
  tracing: {
    disableAutomaticTracing: true
  }
});
```

Finally, you can disable automatic tracing by setting the environment variable `INSTANA_DISABLE_AUTO_INSTR=true`.

When automatic tracing is disabled, you can still use the SDK or the OpenTracing API to create spans manually.

### Capturing Stack Traces
By default, the collector captures the last ten call sites for every captured exit span. This value can be increased and decreased as necessary. Use a value of `0` to disable stack trace capturing.

```javascript
require('@instana/collector')({
  tracing: {
    stackTraceLength: 10
  }
});
```

You can also configure the stack trace length by setting the environment variable `INSTANA_STACK_TRACE_LENGTH`.

### SDK/OpenTracing Service Naming
Services are a central concept within Instana. Spans and traces are associated to services. To name services when using the SDK or OpenTracing, you can configure the `serviceName` property.

```javascript
require('@instana/collector')({
  serviceName: 'shop'
});
```

You can also configure a custom service name by setting the environment variable `INSTANA_SERVICE_NAME`.

## Reporting Uncaught Exceptions
The Instana Node.js collector has the ability to report uncaught exceptions. By default, a Node.js process will be terminated by an uncaught exception (see [Node.js docs](https://nodejs.org/api/process.html#process_event_uncaughtexception)). If uncaught exception reporting is enabled, the Instana Node.js collector will register a listener for the `uncaughtException` event and take the following actions when an uncaught exception occurs:

* Report this as an incident to Instana, including the uncaught exception and its stack trace.
* Finish the currently active span and mark it as an error (if tracing is enabled).

It will then rethrow the original exception to terminate the Node.js process. (Keeping a Node.js process running after an uncaught exception has occurred is strongly discouraged, as the process might be in an inconsistent state, see [Node.js docs](https://nodejs.org/api/process.html#process_warning_using_uncaughtexception_correctly).)

Reporting uncaught exceptions is disabled by default. It can be enabled with the option `reportUncaughtException`, as follows:

```javascript
require('@instana/collector')({
  reportUncaughtException: true
});
```

The [Node.js docs](https://nodejs.org/api/process.html#process_event_uncaughtexception) advise that the "correct use of 'uncaughtException' is to perform synchronous cleanup of allocated resources (e.g. file descriptors, handles, etc) before shutting down the process." Instana adheres to this and only executes synchronous actions before rethrowing the error.

The downside of this is that it might prolong the time it takes for the application process to finally terminate after the uncaught exception. Since the actions are synchronous, no other incoming requests will be accepted by your application during this time, that is, the process will be unresponsive to incoming request (HTTP, WebSockets, ...). This is an important safeguard, since the application might already be in an inconsistent state, so it would not be safe to accept/process any more requests in this process. However, this has two drawbacks:

* If you have a mechanism in place that restarts the Node.js process once it has crashed, enabling uncaught exception tracking might lead to more failed requests, because the application process is kept alive for a bit longer (though only for a few milliseconds), delaying the automatic restart.
* Since Instana rethrows the original exception synchronously from the uncaught exception handler, other handlers for the 'uncaughtException' event that have been registered after initialising Instana's Node.js collector are not executed. If you want to enable uncaught exception handling and also use your own handlers for this event, they should be registered before initialising Instana's Node.js collector.

## Reporting Unhandled Promise Rejections

In addition to reporting uncaught exceptions, the Instana Node.js collector can also report [unhandled promise rejections](https://nodejs.org/api/process.html#process_event_unhandledrejection) as issues to Instana. An unhandled promise rejection is a promise that is rejected but for which no rejection handler has been defined (that is, the promise chain does not have a `.catch(...)`).

This capability is disabled by default. If it is enabled and an unhandled promise rejection is detected, this is reported as an issue of severity "warning" to Instana.

Note that the call that is in progress while the promise is rejected is not marked as an error due to the unhandled rejection. The reason for this is twofold:
1. Unhandled rejections do not cause an error in the Node.js runtime. Even if unhandled rejections occur during the processing of a request, the request can still be processed successfully.
2. The Node.js runtime has no way of detecting unhandled rejections _in the context of specific calls_. In fact, unhandled rejections are only detected later, when the associated promise is about to be garbage collected. By that time, the request which triggered the unhandled rejection is already finished and has been responded to.

This capability can be enabled with the option `reportUnhandledPromiseRejections`, as follows:

```javascript
require('@instana/collector')({
  reportUnhandledPromiseRejections: true
});
```

Note that enabling [`reportUncaughtException`](#reporting-uncaught-exceptions) implicitly enables `reportUnhandledPromiseRejections`. If required, you can enable `reportUncaughtException` and explicitly disable `reportUnhandledPromiseRejections`, like this:

```javascript
require('@instana/collector')({
  reportUncaughtException: true,
  reportUnhandledPromiseRejections: false
});
```

Starting with Node.js 12.0.0, there is a command line flag [`--unhandled-rejections`](https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode) that controls how unhandled promise rejections are handled. Reporting unhandled rejections is not supported with `--unhandled-rejections=strict`, because in this mode, Node.js will convert unhandled rejections to uncaught exceptions. Use the [`reportUncaughtException`](#reporting-uncaught-exceptions) option instead of `reportUnhandledPromiseRejections` when running Node.js with `--unhandled-rejections=strict`.

## Logging

### Bunyan Parent Logger
This collector is using the [bunyan](https://www.npmjs.com/package/bunyan) logging module. By default, the Node.js collector uses a standard bunyan logger with an `INFO` log level. You can a define parent logger for all the loggers created by this module in the following way:

```javascript
require('@instana/collector')({
  logger: A_LOGGER
});
```

Other logging modules are supported if they provide functions for the log levels `debug`, `info`, `warn` and `error`.

### Log Level Configuration
The Node.js collector will now create children of this logger with the same log level and target streams. If you only want to change the default log level, you can configure it via:

```javascript
require('@instana/collector')({
  level: 'debug'
});
```

You can also configure the log level by setting the environment variable `INSTANA_LOG_LEVEL` to either `'debug', 'info', 'warn' or 'error'`. Finally, setting `INSTANA_DEBUG` (or `INSTANA_DEV` for backwards compatibility) to any non-empty string will set the log level to `debug`.

## Agent Communication

### Agent Host
The collector tries to communicate with the Instana agent via IP `127.0.0.1` and as a fallback via the host's default gateway. Should the agent not be available under either of these IPs, e.g. due to iptables or other networking tricks, you can use the `agentHost` option to use a custom IP.

```javascript
require('@instana/collector')({
  agentHost: '::1' // use IPv6 to contact via localhost
});
```

Or leverage an environment variable.

```javascript
require('@instana/collector')({
  agentHost: process.env.HOST_IP
});
```

If not configured, the Instana collector will look for an environment variable called `INSTANA_AGENT_HOST` and use what is defined in this environment variable to communicate with the agent. If there is no such environment variable, it will try to contact the agent first on `localhost` and then on the default gateway.

### Agent Port
The collector tries to communicate with the Instana Agent via port `42699`. Should the port have been changed, you can use the `agentPort` option to change the port.

```javascript
require('@instana/collector')({
  agentPort: 42699
});
```

If not configured, the Instana collector will look for an environment variable called `INSTANA_AGENT_PORT` and use what is defined in this environment variable to communicate with the agent. If there is no such environment variable, it will fall back to the default port 42699.

### Agent Name
This collector communicates with the Instana Agent via HTTP. While doing so, the Node.js collector validates the Instana Agent's `Server` response header. Should you have changed the `Server` name, use the `agentName` option to adjust the collector's validation rules.

```javascript
require('@instana/collector')({
  agentName: 'Instana Agent'
});
```

If not configured, the Instana collector will look for an environment variable called `INSTANA_AGENT_NAME` and use what is defined in this environment variable to communicate with the agent.

### Kubernetes

If your Node.js application and the Instana agent run in a Kubernetes cluster, please refer to the [Instana documentation](https://docs.instana.io/quick_start/agent_setup/container/kubernetes/#configuring-network-access-for-monitored-applications) about configuring network access in this setup.

## Full Configuration Reference

Here are all possible configuration values, with their default values:

```
{
  agentHost: '127.0.0.1',
  agentPort: 42699,
  agentName: 'Instana Agent',
  serviceName: null,
  // the log level
  level: 'info',
  tracing: {
    enabled: true,
    automaticTracingEnabled: true,
    // Spans are batched and sent to the agent once every second, or if ${forceTransmissionStartingAt} spans have been collected (whichever happens earlier)
    forceTransmissionStartingAt: 500,
    // If more than ${maxBufferedSpans} have been buffered and the collector has not been able to send them to the agent, it will start to drop spans to avoid causing memory issues.
    maxBufferedSpans: 1000,
    http: {
      // This is usually configured at the agent level (configuration.yaml).
      extraHttpHeadersToCapture: []
    },
    // How many stack trace frames are to be captured. Can also be 0 to disable collecting stack traces.
    stackTraceLength: 10
  },
  metrics: {
    timeBetweenHealthcheckCalls: 3000
  },
  // This is usually configured at the agent level (configuration.yaml).
  secrets: {
    matcherMode: 'contains-ignore-case',
    keywords: ['key', 'pass', 'secret']
  }
}
```

The following is a list of all environment variables that the Node.js collector supports:

| Environment Variable              | Equivalent Configuration Option                   |
|-----------------------------------|---------------------------------------------------|
| `INSTANA_AGENT_HOST`              | `config.agentHost`                                |
| `INSTANA_AGENT_PORT`              | `config.agentPort`                                |
| `INSTANA_AGENT_NAME`              | `config.agentName`                                |
| `INSTANA_SERVICE_NAME`            | `config.serviceName`                              |
| `INSTANA_DISABLE_TRACING=true`    | `config.tracing.enabled = false`                  |
| `INSTANA_DISABLE_AUTO_INSTR=true` | `config.tracing.automaticTracingEnabled = false`  |
| `INSTANA_STACK_TRACE_LENGTH`      | `config.tracing.stackTraceLength`                 |
| `INSTANA_LOG_LEVEL`               | `config.level`                                    |
| `INSTANA_DEBUG`                   |  `config.level=debug`                             |
| `INSTANA_DEV`                     |  `config.level=debug`                             |

