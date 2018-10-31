/* eslint-disable */

// This is a tiny express app which responds to all methods and has configurable
// latency and response codes. This can be used a baselines for many tests, e.g.
// to test distributed tracing.

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    timeBetweenHealthcheckCalls: 1000,
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1,
    stackTraceLength: process.env.STACK_TRACE_LENGTH != null ? parseInt(process.env.STACK_TRACE_LENGTH, 10) : 10
  }
});

var express = require('express');
var semver = require('semver');
var path = require('path');
var fs = require('fs');
var app = express();

var healthcheckFunction = function() {
  return 'OK!';
};

if (semver.satisfies(process.versions.node, '>=6.0.0')) {
  require('admin').configure({
    plugins: [
      require('admin-plugin-healthcheck')({
        checks: {
          configurable: function() {
            healthcheckFunction();
          }
        }
      })
    ]
  });
}

app.get('/return-instana-trace-id', function(req, res) {
  res.send(req.get('x-instana-t'));
});

app.post('/admin/set-to-unhealthy', function(req, res) {
  healthcheckFunction = function() {
    throw new Error('Explicit healthcheck failure');
  };
  res.send('OK');
});

app.post('/admin/set-to-healthy', function(req, res) {
  healthcheckFunction = function() {
    return 'OK';
  };
  res.send('OK');
});

var router = express.Router();
router.get('/subPath', function(req, res) {
  res.sendStatus(200);
});
app.use('/routed', router);

app.use(function(req, res) {
  log(req.method, req.url);
  var delay = parseInt(req.query.delay || 0, 10);
  var responseStatus = parseInt(req.query.responseStatus || 200, 10);

  if (req.query.cookie) {
    res.set('set-CooKie', req.query.cookie);
  }
  if (req.query.serverTiming) {
    res.set('sErver-tiMING', 'myServerTimingKey');
  }
  if (req.query.serverTimingArray) {
    res.set('sErver-tiMING', ['key1', 'key2;dur=42']);
  }

  setTimeout(function() {
    res.sendStatus(responseStatus);
  }, delay);
});

if (process.env.USE_HTTPS === 'true') {
  require('https')
    .createServer(
      {
        key: fs.readFileSync(path.join(__dirname, 'ssl', 'key')),
        cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert'))
      },
      app
    )
    .listen(process.env.APP_PORT, function() {
      log('Listening (HTTPS!) on port: ' + process.env.APP_PORT);
    });
} else {
  app.listen(process.env.APP_PORT, function() {
    log('Listening on port: ' + process.env.APP_PORT);
  });
}

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Express App (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
