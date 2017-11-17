# instana-nodejs-sensor &nbsp; [![Build Status](https://travis-ci.org/instana/nodejs-sensor.svg?branch=master)](https://travis-ci.org/instana/nodejs-sensor) [![Code Climate](https://codeclimate.com/github/instana/nodejs-sensor/badges/gpa.svg)](https://codeclimate.com/github/instana/nodejs-sensor) [![Dependency Status](https://david-dm.org/instana/nodejs-sensor/master.svg)](https://david-dm.org/instana/nodejs-sensor/master) [![devDependency Status](https://david-dm.org/instana/nodejs-sensor/master/dev-status.svg)](https://david-dm.org/instana/nodejs-sensor/master#info=devDependencies) [![OpenTracing Badge](https://img.shields.io/badge/OpenTracing-enabled-blue.svg)](http://opentracing.io)

Monitor your Node.js applications with Instana!

**[Installation](#installation-and-usage) |**
**[OpenTracing](#opentracing) |**
**[Configuration](CONFIGURATION.md) |**
**[Changelog](CHANGELOG.md)**

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Installation and Usage](#installation-and-usage)
- [Garbage Collection and Event Loop Information](#garbage-collection-and-event-loop-information)
- [OpenTracing](#opentracing)
  - [Connecting OpenTracing spans to Instana spans](#connecting-opentracing-spans-to-instana-spans)
  - [Limitations](#limitations)
- [FAQ](#faq)
  - [How can the Node.js sensor be disabled for (local) development?](#how-can-the-nodejs-sensor-be-disabled-for-local-development)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


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
apt-get install build-essential
# -or-
yum groupinstall "Development Tools"
```

**It is important that the installation of the dependencies is happening on the machine which will run the application.** This needs to be ensured, because otherwise native addons may be incompatible with the target machine's system architecture or the Node.js version in use. It is therefore a *bad practice* to `npm install` dependencies on a build server and to copy the application (including the dependencies) to the target machine.

## OpenTracing
This sensor automatically instruments widely used APIs to add tracing support, e.g. HTTP server / client of the Node.js core API. Sometimes you may find that this is not enough or you may already have invested in [OpenTracing](http://opentracing.io). The OpenTracing API is implemented by this Node.js sensor. This API can be used to provide insights into areas of your applications, e.g. custom libraries and frameworks, which would otherwise go unnoticed.

In order to use OpenTracing for Node.js with Instana, you need to [enable tracing](https://github.com/instana/nodejs-sensor/blob/master/CONFIGURATION.md#tracing) and use the Instana OpenTracing API implementation. The following sample project shows how this is done.

```javascript
const instana = require('instana-nodejs-sensor');

// Always initialize the sensor as the first module inside the application.
instana({
  tracing: {
    enabled: true
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

### Connecting OpenTracing spans to Instana spans
The Node.js sensor automatically instruments common HTTP and database APIs for your convenience. It would therefore be inefficient to do this again using OpenTracing. We recommend to use the OpenTracing APIs to add additional tracing insights on top of the auto-generated Instana traces. To support this, Instana offers an additional API to retrieve the currently existing OpenTracing SpanContext. This SpanContext can then be used to stitch traces together. The following code sample shows how this could be done for a simple [expressjs](https://expressjs.com/) app.

```javascript
const instana = require('instana-nodejs-sensor');
instana({
  tracing: {
    enabled: true
  }
});

const opentracing = require('opentracing');
const express = require('express');

opentracing.initGlobalTracer(instana.opentracing.createTracer());
const tracer = opentracing.globalTracer();

const app = express();

app.get('/', (req, res) => {
  var spanContext = instana.opentracing.getCurrentlyActiveInstanaSpanContext();
  var authSpan = tracer.startSpan('auth', {childOf: spanContext});
  authSpan.finish();
  res.send('OK');
});

app.listen(300, function() {
  log('Listening on port 3000');
});
```

### Limitations
The Instana Node.js sensor does not yet have support for OpenTracing binary carriers. This OpenTracing implementation will silently ignore OpenTracing binary carrier objects.

Care should also be taken with OpenTracing baggage items. Baggage items are meta data which is transported via carrier objects across network boundaries. Furthermore, this meta data is inherited by child spans (and their child spans…). This can produce some overhead. We recommend to completely avoid the OpenTracing baggage API.

## FAQ

### How can the Node.js sensor be disabled for (local) development?
The easiest way to disable the Node.js sensor for development is to use environment variables. The Express framework popularized the environment variable `NODE_ENV` for this purpose, which we recommend to use for this purpose. Load the Node.js sensor in the following way:

```javascript
if (process.env.NODE_ENV !== 'development') {
  require('instana-nodejs-sensor')();
}
```

Next, start your application locally with the `NODE_ENV` variable set to `development`. Example:

```
export NODE_ENV=development
# -or-
NODE_ENV=development node myApp.js
```
