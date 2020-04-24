'use strict';

const config = {};

if (process.env.SERVICE_CONFIG) {
  config.serviceName = process.env.SERVICE_CONFIG;
}

const logPrefix = `Server (${process.pid}):\t`;

if (process.env.SCREW_AROUND_WITH_UP_ARRAY_FIND) {
  log('!Breaking Array.find on purpose!');
  // Yoinked from https://github.com/montagejs/collections/blob/v1.0.0/shim-array.js
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'find', {
    value: function(value, equals) {
      equals = equals || this.contentEquals || Object.equals;
      for (var index = 0; index < this.length; index++) {
        if (index in this && equals(this[index], value)) {
          return index;
        }
      }
      return -1;
    },
    writable: true,
    configurable: true,
    enumerable: false
  });
}

require('../../../')(config);

const http = require('http');
const pino = require('pino')();
const port = process.env.APP_PORT || 3000;
const app = new http.Server();

app.on('request', (req, res) => {
  if (process.env.WITH_STDOUT) {
    log(`${req.method} ${req.url}`);
  }
  if (req.url.indexOf('with-log') >= 0) {
    pino.error('This error message should be traced, unless the pino instrumentation is disabled.');
  }
  res.end();
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
