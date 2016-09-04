'use strict';

var http = require('http');

module.exports = exports = Object.create(http);

// Copy request property to ensure that we will not instrument
// sensor HTTP requests to the agent.
exports.request = http.request;

exports.agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5
});
