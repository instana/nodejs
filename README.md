# instana-nodejs-sensor &nbsp; [![Build Status](https://travis-ci.org/instana/nodejs-sensor.svg?branch=master)](https://travis-ci.org/instana/nodejs-sensor) [![Dependency Status](https://david-dm.org/instana/nodejs-sensor/master.svg)](https://david-dm.org/instana/nodejs-sensor/master) [![devDependency Status](https://david-dm.org/instana/nodejs-sensor/master/dev-status.svg)](https://david-dm.org/instana/nodejs-sensor/master#info=devDependencies)

Monitor your Node.js applications with Instana!

**[Installation](#installation) |**
**[Configuration](CONFIGURATION.md) |**
**[Changelog](CHANGELOG.md)**

---

<!-- TOC depthFrom:2 depthTo:6 withLinks:1 updateOnSave:1 orderedList:0 -->

- [Installation and Usage](#installation-and-usage)
- [Garbage Collection and Event Loop Information](#garbage-collection-and-event-loop-information)

<!-- /TOC -->


## Installation and Usage
The installation of the Instana Node.js sensor is a simple two step process. First, install the `instana-nodejs-sensor` package in your application via:

```
npm install --save instana-nodejs-sensor
```

Now that the sensor is installed, it needs to be activated from within the application. Do this by requiring and initializing it as the *first statement* in your application. Please take care that this is the first statement as the sensor will otherwise not be able to access certain information.

```javascript
require('instana-nodejs-sensor')();
```

The code shown above initializes the sensor with default configuration options. Refer to the [CONFIGURATION.md](CONFIGURATION.md) file for a list of valid configuration options.

## Garbage Collection and Event Loop Information
Some information is not available to Node.js programs without the help of native addons. Specifically, the Instana Node.js sensor uses these addons to retrieve information about garbage collection and event loop activity. While the sensor works fine without these native addons (technically, they are marked as *optional dependencies*), we strongly recommend you to support native addon compilation.

Native addons are compiled automatically for your system and Node.js version when the Instana Node.js sensor dependency is installed (as part of the `npm install` step). In order for the compilation to work, the system needs to have tools like `make` and `g++` installed. These tools can often be installed via a bundle called `build-essential` or similar (depending on your package manager and registry). The following example shows how to do this for a typical Ubuntu setup.

```
sudo apt-get install build-essential
```
