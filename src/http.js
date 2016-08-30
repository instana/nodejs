'use strict';

var http = require('http');

module.exports = exports = Object.create(http);

exports.agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5
});
