/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

require('./mockVersion');
require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const graphQL = require('graphql');
const morgan = require('morgan');
const amqp = require('amqplib');

const { schema } = require('./schema')();

const graphql = graphQL.graphql;

const port = require('../../../test_util/app-port')();
const app = express();

const logPrefix = `GraphQL (raw) Server (${process.pid}):\t`;

let channel;
const requestQueueName = 'graphql-request-queue';
let amqpConnected = false;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

amqp
  .connect('amqp://localhost')
  .then(connection => connection.createChannel())
  .then(_channel => {
    channel = _channel;
    return channel.assertQueue(requestQueueName, { durable: false });
  })
  .then(() => channel.purgeQueue(requestQueueName))
  .then(() => {
    channel.prefetch(1);
    channel.consume(requestQueueName, msg => {
      channel.ackAll();
      const requestContent = JSON.parse(msg.content.toString());
      if (!requestContent || typeof requestContent.query !== 'string') {
        channel.sendToQueue(msg.properties.replyTo, Buffer.from('You need to provide a query.'), {
          correlationId: msg.properties.correlationId
        });
        return;
      }

      if (process.env.GRAPHQL_REQUIRE === 'graphql-v16') {
        graphql({
          schema,
          source: requestContent.query,
          variableValues: requestContent.variables
        }).then(result => {
          const stringifiedResult = JSON.stringify(result);
          channel.sendToQueue(msg.properties.replyTo, Buffer.from(stringifiedResult), {
            correlationId: msg.properties.correlationId
          });
        });
      } else {
        graphql(schema, requestContent.query, null, null, requestContent.variables).then(result => {
          const stringifiedResult = JSON.stringify(result);
          channel.sendToQueue(msg.properties.replyTo, Buffer.from(stringifiedResult), {
            correlationId: msg.properties.correlationId
          });
        });
      }
    });
    amqpConnected = true;
    log('amqp connection established');
  });

app.get('/', (req, res) => {
  if (amqpConnected) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.use('/graphql', bodyParser.json());

app.post('/graphql', (req, res) => {
  if (!req.body || typeof req.body.query !== 'string') {
    return res.status(400).send('You need to provide a query.');
  }
  if (process.env.GRAPHQL_REQUIRE === 'graphql-v16') {
    graphql({ schema, source: req.body.query, variableValues: req.body.variables }).then(result => {
      res.send(result);
    });
  } else {
    graphql(schema, req.body.query, null, null, req.body.variables).then(result => {
      res.send(result);
    });
  }
});

app.listen(port, () => {
  log(`Listening on port ${port}.`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
