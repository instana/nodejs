# @instana/collector &nbsp; [![OpenTracing Badge](https://img.shields.io/badge/OpenTracing-enabled-blue.svg)](http://opentracing.io)

Monitor your Node.js applications with Instana!

**[Installation](#installation-and-usage) |**
**[Configuration](CONFIGURATION.md) |**
**[API](API.md) |**
**[Changelog](https://github.com/instana/nodejs/blob/main/CHANGELOG.md)**

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Server Only](#server-only)
- [Installation And Usage](#installation-and-usage)
- [CPU Profiling, Garbage Collection And Event Loop Information](#cpu-profiling-garbage-collection-and-event-loop-information)
- [API](#api)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

Most of this document has been moved to the [Node.js page](https://www.instana.com/docs/ecosystem/node-js/) of the [Instana documentation portal](https://www.instana.com/docs/). The following sections mostly serve as redirects for people having arrived here following outdated links.

## Server Only

**PSA**: This package is for monitoring *Node.js server applications* with Instana. If you want to monitor JavaScript applications running in a browser, check out our docs on [website monitoring](https://www.instana.com/docs/products/website_monitoring).

## Installation And Usage

The installation of the Instana Node.js collector is a simple two step process. First, install the `@instana/collector` package in your application via:

```javascript
npm install --save @instana/collector
```

Now that the collector is installed, it needs to be activated from within the application. Do this by requiring and initializing it as the *first statement* in your application. Please take care that this is the first statement as the collector will otherwise not be able to access certain information.

```javascript
require('@instana/collector')();

// All other require statements must be done after the collector is initialized.
// Note the () after the require statement of the collector which initializes it.

// const express = require('express');
```

For more in-depth information, refer to the [installation page](https://www.instana.com/docs/ecosystem/node-js/installation/).

## CPU Profiling, Garbage Collection And Event Loop Information

The Node.js collector uses Native addons for some metrics. Check out the [native addons documentation](https://www.instana.com/docs/ecosystem/node-js/installation/#native-addons) for details.

## API

In most cases it is enough to require and initialize `@instana/collector` and let it do its work. However, there is an [API](https://www.instana.com/docs/ecosystem/node-js/api/) for more advanced use cases.

