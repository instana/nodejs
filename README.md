# instana-nodejs-sensor &nbsp; [![Build Status](https://travis-ci.org/instana/nodejs-sensor.svg?branch=master)](https://travis-ci.org/instana/nodejs-sensor) [![Dependency Status](https://david-dm.org/instana/nodejs-sensor/master.svg)](https://david-dm.org/instana/nodejs-sensor/master) [![devDependency Status](https://david-dm.org/instana/nodejs-sensor/master/dev-status.svg)](https://david-dm.org/instana/nodejs-sensor/master#info=devDependencies) [![npm version](https://badge.fury.io/js/instana-nodejs-sensor.svg)](https://badge.fury.io/js/instana-nodejs-sensor)

Monitor your Node.js applications with Instana!

**[Installation](#installation) |**
**[Changelog](CHANGELOG.md)**

---

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
Now that the sensor is installed, it needs to be activated from within your application. You do this by requiring it as the *first line* in your application.

```javascript
require('instana-nodejs-sensor')();
```

## Enable Logging
This sensor is using the [bunyan](https://www.npmjs.com/package/bunyan) logging module. By default, the Node.js sensor uses a standard bunyan logger with an `INFO` log level. You can override the logger as follows:

```javascript
require('instana-nodejs-sensor')({
  logger: SOME_BUNYAN_LOGGER
});
```

The Node.js sensor will now create children of this logger with the same log level and target streams. If you only want to change the default log level, you can configure it via:

```javascript
require('instana-nodejs-sensor')({
  level: 'warn'
});
```
