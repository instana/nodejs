<h1 align="center">instana-nodejs-sensor</h1>
<p align="center">Monitor your Node.js applications with Instana</p>

## Install

Install the Instana Node.js sensor for production usage:
```
npm install --save instana-nodejs-sensor
```

Enable it by requiring it as the *first line* in your application:
```javascript
require('instana-nodejs-sensor')();
```

## Enable Logging
This sensor is using the [debug](https://www.npmjs.com/package/debug) module. To enable logging, set the `DEBUG=instana-nodejs-sensor:*` environment variable before starting your app. Example:

```
DEBUG=instana-nodejs-sensor:* npm start
```
