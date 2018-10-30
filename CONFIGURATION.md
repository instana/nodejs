# Configuration

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Tracing](#tracing)
  - [Disabling Automatic Tracing](#disabling-automatic-tracing)
  - [Capturing Stack Traces](#capturing-stack-traces)
  - [OpenTracing Service Naming](#opentracing-service-naming)
- [Reporting Uncaught Exceptions](#reporting-uncaught-exceptions)
- [Logging](#logging)
  - [Bunyan Parent Logger](#bunyan-parent-logger)
  - [Log Level Configuration](#log-level-configuration)
- [Agent Communication](#agent-communication)
  - [Agent Host](#agent-host)
  - [Agent Port](#agent-port)
  - [Agent Name](#agent-name)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Tracing
The Tracing feature is enabled by default. To disable it, pass the following option to the initialization function.

```javascript
require('instana-nodejs-sensor')({
  tracing: {
    enabled: false
  }
});
```

### Disabling Automatic Tracing
Automatic tracing is enabled by default. To disable it, pass the following option to the initialization function.

```javascript
require('instana-nodejs-sensor')({
  tracing: {
    disableAutomaticTracing: true
  }
});
```

### Capturing Stack Traces
By default, the sensor captures the last ten call sites for every captured exit span. This value can be increased and decreased as necessary. Use a value of `0` to disable stack trace capturing.

```javascript
require('instana-nodejs-sensor')({
  tracing: {
    enabled: true,
    stackTraceLength: 10
  }
});
```

### OpenTracing Service Naming
Services are a central concept within Instana. Spans and traces are associated to services. To name services when using OpenTracing, you can configure the `serviceName` property.

```javascript
require('instana-nodejs-sensor')({
  serviceName: 'shop'
});
```

## Reporting Uncaught Exceptions
The Instana Node.js sensor has the ability to report uncaught exceptions. By default, a Node.js process will be terminated by an uncaught exception (see [Node.js docs](https://nodejs.org/api/process.html#process_event_uncaughtexception)). If uncaught exception reporting is enabled, the Instana Node.js sensor will register a listener for the `uncaughtException` event and take the following actions when an uncaught exception occurs:

* Report this as an incident to Instana, including the uncaught exception and its stack trace.
* Finish the currently active span and mark it as an error (if automatic tracing is enabled).

It will then rethrow the original exception to terminate the Node.js process. (Keeping a Node.js process running after an uncaught exception has occurred is strongly discouraged, as the process might be in an inconsistent state, see [Node.js docs](https://nodejs.org/api/process.html#process_warning_using_uncaughtexception_correctly).)

Reporting uncaught exceptions is disabled by default. It can be enabled with the option `reportUncaughtException`, as follows:

```javascript
require('instana-nodejs-sensor')({
  reportUncaughtException: true
});
```

The [Node.js docs](https://nodejs.org/api/process.html#process_event_uncaughtexception) advise that the "correct use of 'uncaughtException' is to perform synchronous cleanup of allocated resources (e.g. file descriptors, handles, etc) before shutting down the process." Instana adheres to this and only executes synchronous actions before rethrowing the error.

The downside of this is that it might prolong the time it takes for the application process to finally terminate after the uncaught exception. Since the actions are synchronous, no other incoming requests will be accepted by your application during this time, that is, the process will be unresponsive to incoming request (HTTP, WebSockets, ...). This is an important safeguard, since the application might already be in an inconsistent state, so it would not be safe to accept/process any more requests in this process. However, this has two drawbacks:

* If you have a mechanism in place that restarts the Node.js process once it has crashed, enabling uncaught exception tracking might lead to more failed requests, because the application process is kept alive for a bit longer (though only for a few milliseconds), delaying the automatic restart.
* Since Instana rethrows the original exception synchronously from the uncaught exception handler, other handlers for the 'uncaughtException' event that have been registered after initialising Instana's nodejs-sensor are not executed. If you want to enable uncaught exception handling and also use your own handlers for this event, they should be registered before initialising Instana's nodejs-sensor.


## Logging

### Bunyan Parent Logger
This sensor is using the [bunyan](https://www.npmjs.com/package/bunyan) logging module. By default, the Node.js sensor uses a standard bunyan logger with an `INFO` log level. You can a define parent logger for all the loggers created by this module in the following way:

```javascript
require('instana-nodejs-sensor')({
  logger: A_LOGGER
});
```

Other logging modules are supported if they provide functions for the log levels `debug`, `info`, `warn` and `error`.

### Log Level Configuration
The Node.js sensor will now create children of this logger with the same log level and target streams. If you only want to change the default log level, you can configure it via:

```javascript
require('instana-nodejs-sensor')({
  level: 'debug'
});
```

## Agent Communication

### Agent Host
The sensor tries to communicate with the Instana agent via IP `127.0.0.1` and as a fallback via the host's default gateway. Should the agent not be available under either of these IPs, e.g. due to iptables or other networking tricks, you can use the `agentHost` option to use a custom IP.

```javascript
require('instana-nodejs-sensor')({
  agentHost: '::1' // use IPv6 to contact via localhost
});
```

Or leverage an environment variable.

```javascript
require('instana-nodejs-sensor')({
  agentHost: process.env.HOST_IP
});
```

If not configured, the Instana sensor will look for an environment variable called `INSTANA_AGENT_HOST` and use what is defined in this environment variable to communicate with the agent.

### Agent Port
The sensor tries to communicate with the Instana Agent via port `42699`. Should the port have been changed, you can use the `agentPort` option to change the port.

```javascript
require('instana-nodejs-sensor')({
  agentPort: 42699
});
```

If not configured, the Instana sensor will look for an environment variable called `INSTANA_AGENT_PORT` and use what is defined in this environment variable to communicate with the agent.

### Agent Name
This sensor communicates with the Instana Agent via HTTP. While doing so, the Node.js sensor validates the Instana Agent's `Server` response header. Should you have changed the `Server` name, use the `agentName` option to adjust the sensor's validation rules.

```javascript
require('instana-nodejs-sensor')({
  agentName: 'Instana Agent'
});
```

If not configured, the Instana sensor will look for an environment variable called `INSTANA_AGENT_NAME` and use what is defined in this environment variable to communicate with the agent.

### Kubernetes

If your Node.js application and the Instana agent run in a Kubernetes cluster, please refer to the [Instana documentation](https://docs.instana.io/quick_start/agent_setup/container/kubernetes/#configuring-network-access-for-monitored-applications) about configuring network access in this setup.

