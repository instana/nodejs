/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var logPrefix = 'HTTP: Server (' + process.pid + '):\t';

var http = require('http');
var port = process.env.APP_PORT || 3000;
var app = new http.Server();

app.on('request', function(req, res) {
  if (process.env.WITH_STDOUT) {
    log(req.method + ' ' + req.url);
  }
  res.end();
});

app.listen(port, function() {
  log('Listening on port: ' + port);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
