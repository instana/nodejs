'use strict';

const instana = require('../../../../');
instana({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const cls = require('../../../../../core/src/tracing/cls');

const express = require('express');
const morgan = require('morgan');

const graphqlSubscriptions = require('graphql-subscriptions');
const pubsub = new graphqlSubscriptions.PubSub();
const eventName = 'event-name';
const asyncIterator = pubsub.asyncIterator(eventName);

const app = express();
const logPrefix = `PubSub AsyncIterator pull-before-push app (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.sendStatus(200);
});

const valuesReadFromCls = [];

// Calling asyncIterator.pullValue is what happens _before_ the pubsub.publish happens (possibly during
// pubsub.subscribe). The promises returned by pullValue will only resolve after we have pushed values.
asyncIterator.pullValue().then(event1 => {
  // Chronologically, everything inside the then-handler this happens after cls.ns.set (see below). Due to custom
  // queueing in pubsub_async_iterator, the cls context would get lost though (unless we fix it).
  log(event1);
  valuesReadFromCls.push(cls.ns.get('key'));
  asyncIterator.pullValue().then(event2 => {
    log(event2);
    valuesReadFromCls.push(cls.ns.get('key'));
    asyncIterator.pullValue().then(event3 => {
      log(event3);
      valuesReadFromCls.push(cls.ns.get('key'));
    });
  });
});

app.get('/pull-before-push', (req, res) => {
  // This order of events (pulling values before pushing values) does not work without some tracing blood magic.

  // Calling asyncIterator.pushValue is what happens during pubsub.publish('event-name', { ... })
  cls.ns.set('key', 'test-value');
  asyncIterator.pushValue({ name: 'event-01' });
  asyncIterator.pushValue({ name: 'event-02' });
  asyncIterator.pushValue({ name: 'event-03' });
  setTimeout(() => {
    res.send(valuesReadFromCls);
  }, 200);
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
