/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');

require('../../../..')();

const cls = require('../../../../../core/src/tracing/cls');
const express = require('express');
const morgan = require('morgan');
const graphqlSubscriptions = require('graphql-subscriptions');
const port = require('../../../test_util/app-port')();

const pubsub = new graphqlSubscriptions.PubSub();
const eventName = 'event-name';

const version = process.env.GRAPHQL_SUBSCRIPTIONS_VERSION;
const isV2 = version === 'v2';

const iterator = isV2 ? pubsub.asyncIterator(eventName) : pubsub.asyncIterableIterator(eventName);

const app = express();
const logPrefix = `PubSub iterator pull-before-push app (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.sendStatus(200);
});

const valuesReadFromCls = [];

// Calling iterator.pullValue is what happens _before_ the pubsub.publish happens (possibly during
// pubsub.subscribe). The promises returned by pullValue will only resolve after we have pushed values.
iterator.pullValue().then(event1 => {
  // Chronologically, everything inside the then-handler this happens after cls.ns.set (see below). Due to custom
  // queueing in pubsub_async_iterator, the cls context would get lost though (unless we fix it).
  log(event1);
  valuesReadFromCls.push(cls.ns.get('key', true));
  iterator.pullValue().then(event2 => {
    log(event2);
    valuesReadFromCls.push(cls.ns.get('key', true));
    iterator.pullValue().then(event3 => {
      log(event3);
      valuesReadFromCls.push(cls.ns.get('key', true));
    });
  });
});

app.get('/pull-before-push', (req, res) => {
  // This order of events (pulling values before pushing values) does not work without some tracing blood magic.

  // Calling iterator.pushValue is what happens during pubsub.publish('event-name', { ... })
  cls.ns.set('key', 'test-value');
  iterator.pushValue({ name: 'event-01' });
  iterator.pushValue({ name: 'event-02' });
  iterator.pushValue({ name: 'event-03' });
  setTimeout(() => {
    res.send(valuesReadFromCls);
  }, 200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
