/* eslint-disable */

const request = require('request');

require("../../")({
  agentPort: process.env.AGENT_PORT,
  level: "info",
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const express = require("express");
const semver = require("semver");
const app = express();

app.get('/', (req, res) => res.sendStatus(200));

// simulating async middleware
app.use((req, res, next) => setTimeout(() => next(), 50));

app.get('/getSomething', (req, res) => {
  executeCallSequence()
    .then(status => res.sendStatus(status))
    .catch(err => log('Failed to get data', err));
});

async function executeCallSequence() {
  const {response} = await sendRequest({
    method: 'GET',
    uri: 'http://127.0.0.1:' + process.env.UPSTREAM_PORT + '/foo'
  });

  const {response: response2} = await sendRequest({
    method: 'GET',
    uri: 'http://127.0.0.1:' + process.env.UPSTREAM_PORT + '/bar',
    query: {
      foo: response.statusCode
    }
  });

  return response2.statusCode;
}

// a custom wrapper around request. Yes, this exists out of the box for request, but this
// is supposed to be a repro case for a customer issue.
function sendRequest(requestOptions) {
  return new Promise((resolve, reject) => {
    request(requestOptions, (error, response, body) => {
      if (error) {
        reject(error);
      } else {
        if (response.statusCode >= 200 && response.statusCode <= 299) {
          resolve({ response: response, body: body });
        }
        else {
          reject({ response: response, body: body });
        }
      }
    });
  });
}

app.listen(process.env.APP_PORT, function() {
  log("Listening on port: " + process.env.APP_PORT);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = "Express Async Await App (" + process.pid + "):\t" + args[0];
  console.log.apply(console, args);
}
