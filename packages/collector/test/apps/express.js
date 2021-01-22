/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2016
 */

'use strict';

// This is a tiny express app which responds to all methods and has configurable
// latency and response codes. This can be used a baselines for many tests, e.g.
// to test distributed tracing.

const instana = require('../../')({
  agentPort: process.env.AGENT_PORT,
  tracing: {
    timeBetweenHealthcheckCalls: 1000,
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1,
    stackTraceLength: process.env.STACK_TRACE_LENGTH != null ? parseInt(process.env.STACK_TRACE_LENGTH, 10) : 10
  }
});

const express = require('express');
const morgan = require('morgan');
const semver = require('semver');
const path = require('path');
const fs = require('fs');
const app = express();

const port = process.env.APP_PORT || 3215;

const logPrefix = `Express App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

let healthcheckFunction = () => 'OK!';

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

app.get('/return-instana-trace-id', (req, res) => {
  res.send(req.get('x-instana-t'));
});

app.post('/admin/set-to-unhealthy', (req, res) => {
  healthcheckFunction = () => {
    throw new Error('Explicit healthcheck failure');
  };
  res.send('OK');
});

app.post('/admin/set-to-healthy', (req, res) => {
  healthcheckFunction = () => 'OK';
  res.send('OK');
});

app.post('/set-logger', (req, res) => {
  const logFilePath = req.query.logFilePath;
  if (typeof logFilePath !== 'string') {
    return res.sendStatus(400);
  }
  const dummyLogger = {
    debug: appendToDummyLogFile('debug', logFilePath),
    info: appendToDummyLogFile('info', logFilePath),
    warn: appendToDummyLogFile('warn', logFilePath),
    error: appendToDummyLogFile('error', logFilePath)
  };

  instana.setLogger(dummyLogger);

  res.send('OK');
});

function appendToDummyLogFile(level, logFilePath) {
  return message => {
    const content = typeof messsage === 'string' ? message : JSON.stringify(message);
    fs.appendFile(logFilePath, `[${level}]: ${content}\n`, err => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    });
  };
}

const router = express.Router();
router.get('/subPath', (req, res) => {
  res.sendStatus(200);
});
app.use('/routed', router);

app.use((req, res) => {
  log(req.method, req.url);
  const delay = parseInt(req.query.delay || 0, 10);
  const responseStatus = parseInt(req.query.responseStatus || 200, 10);

  if (req.query.cookie) {
    res.set('set-CooKie', req.query.cookie);
  }
  if (req.query.serverTiming) {
    res.set('sErver-tiMING', 'myServerTimingKey');
  }
  if (req.query.serverTimingArray) {
    res.set('sErver-tiMING', ['key1', 'key2;dur=42']);
  }

  setTimeout(() => {
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
    .listen(port, () => {
      log(`Listening (HTTPS!) on port: ${port}`);
    });
} else {
  app.listen(port, () => {
    log(`Listening on port: ${port}`);
  });
}

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix} (${process.pid}):\t${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
