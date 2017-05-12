# Configuration

<!-- TOC depthFrom:2 depthTo:6 withLinks:1 updateOnSave:1 orderedList:0 -->

- [Tracing](#tracing)
	- [Capturing Stack Traces](#capturing-stack-traces)
- [Logging](#logging)
	- [Bunyan Parent Logger](#bunyan-parent-logger)
	- [Log Level Configuration](#log-level-configuration)
- [Agent Communication](#agent-communication)
	- [Agent Port](#agent-port)
	- [Agent Host](#agent-host)
	- [Agent Name](#agent-name)

<!-- /TOC -->

## Tracing
The Tracing feature is enabled by default. To disable it, pass the following option to the initialization function.

```javascript
require('instana-nodejs-sensor')({
  tracing: {
    enabled: false
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

## Logging

### Bunyan Parent Logger
This sensor is using the [bunyan](https://www.npmjs.com/package/bunyan) logging module. By default, the Node.js sensor uses a standard bunyan logger with an `INFO` log level. You can a define parent logger for all the loggers created by this module in the following way:

```javascript
require('instana-nodejs-sensor')({
  logger: A_BUNYAN_LOGGER
});
```

### Log Level Configuration
The Node.js sensor will now create children of this logger with the same log level and target streams. If you only want to change the default log level, you can configure it via:

```javascript
require('instana-nodejs-sensor')({
  level: 'debug'
});
```

## Agent Communication
### Agent Port
The sensor tries to communicate with the Instana Agent via port `42699`. Should the port have been changed, you can use the `agentPort` option to change the port.

```javascript
require('instana-nodejs-sensor')({
  agentPort: 42699
});
```


### Agent Host
The sensor tries to communicate with the Instana Agent on host with IP `127.0.0.1`. Should the IP have been changed, you can use the `agentHost` option to change the host-ip.

```javascript
require('instana-nodejs-sensor')({
  agentHost: '::1' // allow IPv6
});
```

or setting per environment variable, e.g. 

```javascript
require('instana-nodejs-sensor')({
  agentHost: process.env.INSTANA_HOST_IP
});
```
or

### Agent Name
This sensor communicates with the Instana Agent via HTTP. While doing so, the Node.js sensor validates the Instana Agent's `Server` response header. Should you have changed the `Server` name, use the `agentName` option to adjust the sensor's validation rules.

```javascript
require('instana-nodejs-sensor')({
  agentName: 'Instana Agent'
});
```
