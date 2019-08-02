'use strict';

const bodyParser = require('body-parser');
const express = require('express');
// const morgan = require('morgan');
const bunyan = require('bunyan');
const app = express();

const logger = bunyan.createLogger({ name: 'agent-stub', pid: process.pid });
// logger.level('debug');

const extraHeaders = process.env.EXTRA_HEADERS ? process.env.EXTRA_HEADERS.split(',') : [];
const secretsMatcher = process.env.SECRETS_MATCHER ? process.env.SECRETS_MATCHER : 'contains-ignore-case';
const secretsList = process.env.SECRETS_LIST ? process.env.SECRETS_LIST.split(',') : ['key', 'pass', 'secret'];
const dropAllData = process.env.DROP_DATA === 'true';
const logTraces = process.env.LOG_TRACES === 'true';

let discoveries = {};
const requests = {};
let retrievedData = {
  runtime: [],
  traces: [],
  responses: [],
  events: []
};

// We usually do not activate morgan in the agent stub because it creates a lot of noise with little benefit. Activate
// it on demand if required.
// if (process.env.WITH_STDOUT) {
//   app.use(morgan(`Agent Stub (${process.pid}):\t:method :url :status`));
// }

app.use(
  bodyParser.json({
    limit: '10mb'
  })
);

app.use((req, res, next) => {
  res.set('server', 'Instana Agent');
  next();
});

app.get('/', (req, res) => {
  res.send('OK');
});

app.put('/com.instana.plugin.nodejs.discovery', (req, res) => {
  const pid = req.body.pid;
  discoveries[pid] = req.body;

  logger.debug('New discovery %s with params', pid, req.body);

  res.send({
    agentUuid: 'agent-stub-uuid',
    pid,
    extraHeaders,
    secrets: {
      matcher: secretsMatcher,
      list: secretsList
    }
  });
});

app.head(
  '/com.instana.plugin.nodejs.:pid',
  checkExistenceOfKnownPid(function handleAnnounceCheck(req, res) {
    logger.debug('Got announce check for PID %s', req.params.pid);
    res.send('OK');
  })
);

app.post(
  '/com.instana.plugin.nodejs.:pid',
  checkExistenceOfKnownPid(function handleEntityData(req, res) {
    if (!dropAllData) {
      retrievedData.runtime.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        data: req.body
      });
    }

    const requestsForPid = requests[req.params.pid] || [];
    res.json(requestsForPid);
    delete requests[req.params.pid];
  })
);

app.post(
  '/com.instana.plugin.nodejs/traces.:pid',
  checkExistenceOfKnownPid(function handleTraces(req, res) {
    /* eslint-disable no-console */
    if (!dropAllData) {
      retrievedData.traces.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        data: req.body
      });
    }
    if (logTraces) {
      console.log(JSON.stringify(req.body, null, 2));
      console.log('--\n');
    }
    res.send('OK');
  })
);

app.post(
  '/com.instana.plugin.nodejs/response.:pid',
  checkExistenceOfKnownPid(function handleResponse(req, res) {
    if (!dropAllData) {
      retrievedData.responses.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        messageId: req.query.messageId,
        data: req.body
      });
    }
    res.send('OK');
  })
);

function checkExistenceOfKnownPid(fn) {
  return (req, res) => {
    const pid = req.params.pid;
    if (!discoveries[pid]) {
      logger.debug('Rejecting access for PID %s, not a known discovery', pid);
      return res.status(400).send(`Unknown discovery with pid: ${pid}`);
    }
    fn(req, res);
  };
}

app.post('/com.instana.plugin.generic.event', function postEvent(req, res) {
  if (!dropAllData) {
    retrievedData.events.push(req.body);
  }
  res.send('OK');
});

app.get('/retrievedData', (req, res) => {
  res.json(retrievedData);
});

app.get('/retrievedTraces', (req, res) => {
  res.json(retrievedData.traces);
});

app.get('/retrievedEvents', (req, res) => {
  res.json(retrievedData.events);
});

app.delete('/retrievedData', (req, res) => {
  retrievedData = {
    runtime: [],
    traces: [],
    responses: [],
    events: []
  };
  res.sendStatus(200);
});

app.get('/discoveries', (req, res) => {
  res.json(discoveries);
});

app.delete('/discoveries', (req, res) => {
  discoveries = {};
  res.send('OK');
});

app.post('/request/:pid', (req, res) => {
  requests[req.params.pid] = requests[req.params.pid] || [];
  requests[req.params.pid].push(req.body);
  res.send('OK');
});

app.listen(process.env.AGENT_PORT, () => {
  logger.info('Listening on port: %s', process.env.AGENT_PORT);
});
