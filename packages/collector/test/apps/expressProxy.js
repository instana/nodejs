/* eslint-disable */

'use strict';

// This is a tiny express app which responds to all methods and has configurable
// latency and response codes. This can be used a baselines for many tests, e.g.
// to test distributed tracing.

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    enabled: true,
    forceTransmissionStartingAt: 1,
    stackTraceLength: process.env.STACK_TRACE_LENGTH != null ? process.env.STACK_TRACE_LENGTH : 10
  }
});

const express = require('express');
const request = require('request');
const fetch = require('node-fetch');
const app = express();

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.use((req, res) => {
  log(req.method, req.url);
  const delay = parseInt(req.query.delay || 0, 10);
  setTimeout(() => {
    let url;
    if (req.query.url) {
      url = req.query.url;
    } else {
      url = `http://127.0.0.1:${process.env.UPSTREAM_PORT}/proxy-call${req.url}`;
    }

    if (req.query.httpLib === 'node-fetch') {
      // use node-fetch
      fetch(url, {
        method: req.method,
        timeout: 500
      })
        .then(response => {
          res.sendStatus(response.status);
        })
        .catch(err => {
          res.sendStatus(500);
          log('Unexpected error', err);
        });
    } else {
      // use request package
      request(
        {
          method: req.method,
          url,
          qs: req.query,
          timeout: 500
        },
        (err, response) => {
          if (err) {
            res.sendStatus(500);
            log('Unexpected error', err);
          } else {
            res.sendStatus(response.statusCode);
          }
        }
      );
    }
  }, delay * 0.25);
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express Proxy (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
