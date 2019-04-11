# @instana/collector &nbsp; [![OpenTracing Badge](https://img.shields.io/badge/OpenTracing-enabled-blue.svg)](http://opentracing.io)

Monitor your Node.js applications with Instana!

**[Installation](#installation-and-usage) |**
**[Configuration](CONFIGURATION.md) |**
**[API](API.md) |**
**[Changelog](CHANGELOG.md)**

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Server Only](#server-only)
- [Migrating From instana-nodejs-sensor To @instana/collector](#migrating-from-instana-nodejs-sensor-to-instanacollector)
- [Installation And Usage](#installation-and-usage)
- [CPU Profiling, Garbage Collection And Event Loop Information](#cpu-profiling-garbage-collection-and-event-loop-information)
- [API](#api)
- [OpenTracing](#opentracing)
- [FAQ](#faq)
  - [How Can The Node.js Collector Be Disabled For (Local) Development?](#how-can-the-nodejs-collector-be-disabled-for-local-development)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Server Only

**PSA**: This package is for monitoring *Node.js server applications* with Instana. If you want to monitor JavaScript applications running in a browser, check out our docs on [website monitoring](https://docs.instana.io/products/website_monitoring).

## Migrating From instana-nodejs-sensor To @instana/collector

Starting with release `1.65.0`, the name of the npm package has changed from `instana-nodejs-sensor` to `@instana/collector`. Please update the package name in your `package.json` file accordingly and run `npm install`/`yarn install` afterwards (to update `package-lock.json`/`yarn.lock`).

In your source code, you need to replace all occurrences of
* `require('instana-nodejs-sensor')` with `require('@instana/collector')`, and
* `import instana from 'instana-nodejs-sensor'` with `import instana from '@instana/collector'`.

Most applications will only have one such `require`/`import` statement.

Note: To help users that cannot migrate immediately, we will keep publishing new versions of `@instana/collector` _additionally_ under the name `instana-nodejs-sensor` for a while, but please note that this package is now deprecated and you should switch to the new package name as soon as possible.

## Installation And Usage

The installation of the Instana Node.js collector is a simple two step process. First, install the `@instana/collector` package in your application via:

```
npm install --save @instana/collector
```

Now that the collector is installed, it needs to be activated from within the application. Do this by requiring and initializing it as the *first statement* in your application. Please take care that this is the first statement as the collector will otherwise not be able to access certain information.

```javascript
require('@instana/collector')();

// All other require statements must be done after the collector is initialized.
// Note the () after the require statement of the collector which initializes it.

// const express = require('express');
```

The code shown above initializes the collector with default configuration options. Refer to the [CONFIGURATION.md](CONFIGURATION.md) file for a list of valid configuration options, and in particular to the section [Agent Communication](https://github.com/instana/nodejs-sensor/blob/master/packages/collector/CONFIGURATION.md#agent-communication) for details about configuring connectivity between your monitored application and the Instana agent.

*Important:* It is not enough to only have the require statement as the first statement in your application. You need to actually call the function exported by require('@instana/collector'), and this needs to happen before the any other `require` statements. That is, the following is not supported:

```javascript
// WRONG!
require('@instana/collector'); // @instana/collector is not initialized

require('something');
require('another-thing');

...
```

and neither is this:


```javascript
// WRONG!
const instana = require('@instana/collector');

require('something');
require('another-thing');

instana(); // TOO LATE!
...
```

## CPU Profiling, Garbage Collection And Event Loop Information

Some information is not available to Node.js programs without the help of native addons. Specifically, the Instana Node.js collector uses these addons
- to retrieve information about garbage collection,
- to retrieve information about event loop activity,
- for CPU profiling, and
- to report uncaught exceptions (if enabled).

While the collector works fine without these native addons (technically, they are marked as *optional dependencies*), we strongly recommend you to support native addon compilation.

Native addons are compiled automatically for your system and Node.js version when the Instana Node.js collector dependency is installed (as part of the `npm install` step). In order for the compilation to work, the system needs to have tools like `make`, `g++` and `python` installed. These tools can often be installed via a bundle called `build-essential` or similar (depending on your package manager and registry). The following example shows how to do this for a typical Ubuntu setup.

```
apt-get install build-essential
# -or-
yum groupinstall "Development Tools"
```

**It is important that the installation of the dependencies is happening on the machine which will run the application.** This needs to be ensured, because otherwise native addons may be incompatible with the target machine's system architecture or the Node.js version in use. It is therefore a *bad practice* to `npm install` dependencies on a build server and to copy the application (including the dependencies) to the target machine.

If you run your Node.js application dockerized, this aspect deserves extra attention. You might want to check the output of your Docker build for `node-gyp` errors (look for `gyp ERR!` and `node-pre-gyp ERR!`). If these are present, you should inspect and evaluate them. Some of them can be safely ignored. For example, some packages might try to download precompiled binaries, if this fails, they fall back to compilation via `node-gyp` that is, the download error can be ignored, if the compilation step worked. Other packages emit a lot of notes and warnings during compilation, which can also be ignored.

If the installation of an optional dependency ends with `gyp ERR! not ok`, you might want to look into it. While Instana can unfortunately not provide support for fixing your particular `Dockerfile`, we do provide some [example Dockerfiles](https://github.com/instana/nodejs-sensor/tree/master/dockerfile-examples).

## API

In most cases it is enough to require and initialize `@instana/collector` and let it do its work. However, there is an [API](API.md) for more advanced use cases.

## OpenTracing

See [OpenTracing API](API.md#opentracing-integration).

## FAQ

### How Can The Node.js Collector Be Disabled For (Local) Development?

The easiest way to disable the Node.js collector for development is to use environment variables. The Express framework popularized the environment variable `NODE_ENV` for this purpose, which we recommend to use for this purpose. Load the Node.js collector in the following way:

```javascript
if (process.env.NODE_ENV !== 'development') {
  require('@instana/collector')();
}
```

Next, start your application locally with the `NODE_ENV` variable set to `development`. Example:

```
export NODE_ENV=development
# -or-
NODE_ENV=development node myApp.js
```
