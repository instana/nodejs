'use strict';

var http = require('http');
var https = require('https');

module.exports = exports = {
  http: Object.create(http),
  https: Object.create(https)
};

exports.http.get = http.get;
exports.http.request = http.request;
exports.https.get = https.get;
exports.https.request = https.request;

exports.http.agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5
});
