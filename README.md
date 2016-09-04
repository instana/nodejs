# instana-nodejs-sensor &nbsp; [![Build Status](https://travis-ci.org/instana/nodejs-sensor.svg?branch=master)](https://travis-ci.org/instana/nodejs-sensor) [![Dependency Status](https://david-dm.org/instana/nodejs-sensor/master.svg)](https://david-dm.org/instana/nodejs-sensor/master) [![devDependency Status](https://david-dm.org/instana/nodejs-sensor/master/dev-status.svg)](https://david-dm.org/instana/nodejs-sensor/master#info=devDependencies)

Monitor your Node.js applications with Instana!

**[Installation](#installation) |**
**[Changelog](CHANGELOG.md)**

---

<!-- TOC depthFrom:2 depthTo:6 withLinks:1 updateOnSave:1 orderedList:0 -->

- [Installation](#installation)
- [Activation](#activation)
- [Configuration](#configuration)
	- [Logging](#logging)
		- [Bunyan Parent Logger](#bunyan-parent-logger)
		- [Log Level Configuration](#log-level-configuration)
	- [Agent Communication](#agent-communication)
		- [Agent Port](#agent-port)
		- [Agent Name](#agent-name)

<!-- /TOC -->

## Installation
Install the Instana Node.js sensor for production usage:

```
npm install --save instana-nodejs-sensor
```

The Node.js sensor requires native addons. These addons are compiled automatically for your system and Node.js version when you execute the command you see above. In order for this to work the system needs to have tools like `make` and `g++` installed. These tools can often be installed via a bundle called `build-essential` or similar (depending on your package manager and registry).

```
sudo apt-get install build-essential
```

## Activation
Now that the sensor is installed, it needs to be activated from within your application. You do this by requiring and initializing it as the *first line* in your application.

```javascript
require('instana-nodejs-sensor')();
```

## Configuration

### Logging

#### Bunyan Parent Logger
This sensor is using the [bunyan](https://www.npmjs.com/package/bunyan) logging module. By default, the Node.js sensor uses a standard bunyan logger with an `INFO` log level. You can a define parent logger for all the loggers created by this module in the following way:

```javascript
require('instana-nodejs-sensor')({
  logger: A_BUNYAN_LOGGER
});
```

#### Log Level Configuration
The Node.js sensor will now create children of this logger with the same log level and target streams. If you only want to change the default log level, you can configure it via:

```javascript
require('instana-nodejs-sensor')({
  level: 'debug'
});
```

### Agent Communication
#### Agent Port
The sensor tries to communicate with the Instana Agent via port `42699`. Should the port have been changed, you can use the `agentPort` option to change the port.

```javascript
require('instana-nodejs-sensor')({
  agentPort: 42699
});
```


#### Agent Name
This sensor communicates with the Instana Agent via HTTP. While doing so, the Node.js sensor validates the Instana Agent's `Server` response header. Should you have changed the `Server` name, use the `agentName` option to adjust the sensor's validation rules.

```javascript
require('instana-nodejs-sensor')({
  agentName: 'Instana Agent'
});
```

### Tracing

TODO:

- documentation
- demo app
