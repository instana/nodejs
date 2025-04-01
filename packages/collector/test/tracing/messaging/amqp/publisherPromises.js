/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

const agentPort = process.env.AGENT_PORT;
require('./mockVersion');

require('../../../..')({
  agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const amqp = require('amqplib');
const exchange = require('./amqpUtil').exchange;
const queueName = require('./amqpUtil').queueName;
const queueNameGet = require('./amqpUtil').queueNameGet;
const queueNameConfirm = require('./amqpUtil').queueNameConfirm;
let connection;
let channel;
let confirmChannel;

const fetch = require('node-fetch-v2');
const bodyParser = require('body-parser');
const express = require('express');
const port = require('../../../test_util/app-port')();
const app = express();

// promise based amqp publisher
amqp
  .connect(process.env.AMQP)
  .then(_connection => {
    connection = _connection;
    return connection.createChannel();
  })
  .then(_channel => {
    channel = _channel;
    return channel.assertExchange(exchange, 'fanout', { durable: false });
  })
  .then(() =>
    // stand alone queue (for sendToQueue)
    channel.assertQueue(queueName, { durable: false })
  )
  .then(() =>
    // stand alone queue (for get)
    channel.assertQueue(queueNameGet, { durable: false, noAck: true })
  )
  .then(() => channel.purgeQueue(queueNameGet))
  .then(() => connection.createConfirmChannel())
  .then(_confirmChannel => {
    confirmChannel = _confirmChannel;
    return confirmChannel.assertQueue(queueNameConfirm, { durable: false });
  })
  .then(() => {
    log('amqp connection established');
  })
  .catch(console.warn);

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (channel && confirmChannel) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post('/publish', (req, res) => {
  // sendToQueue, publish et al. do not return a promise because they do not necessarily wait for any confirmation from
  // RabbitMQ - see https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  channel.publish(exchange, '', Buffer.from(req.body.message));

  fetch(`http://127.0.0.1:${agentPort}`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err => {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/send-to-queue', (req, res) => {
  // sendToQueue, publish et al. do not return a promise because they do not necessarily wait for any confirmation from
  // RabbitMQ - see https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  channel.sendToQueue(queueName, Buffer.from(req.body.message));

  fetch(`http://127.0.0.1:${agentPort}`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err => {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/send-to-get-queue', (req, res) => {
  // sendToQueue, publish et al. do not return a promise because they do not necessarily wait for any confirmation from
  // RabbitMQ - see https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  log('sending to', queueNameGet);
  channel.sendToQueue(queueNameGet, Buffer.from(req.body.message));

  fetch(`http://127.0.0.1:${agentPort}`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err => {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/publish-to-confirm-channel-without-callback', (req, res) => {
  // @golevelup/nestjs-rabbitmq 3.3.0 did not pass the confirm callback
  // eslint-disable-next-line max-len
  // https://github.com/golevelup/nestjs/blob/%40golevelup/nestjs-rabbitmq%403.3.0/packages/rabbitmq/src/amqp/connection.ts#L541
  // https://github.com/jwalton/node-amqp-connection-manager/blob/v4.1.11/src/ChannelWrapper.ts#L13
  // https://github.com/amqp-node/amqplib/blob/v0.10.3/lib/channel_model.js#L265
  confirmChannel.publish(exchange, '', Buffer.from(req.body.message));

  fetch(`http://127.0.0.1:${agentPort}`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err2 => {
      log(err2);
      res.sendStatus(500);
    });
});

app.post('/send-to-confirm-queue', (req, res) => {
  // Even with a ConfirmChannel and even in the promise API case, sendToQueue/publish do not return a promise, but only
  // accept a callback, see
  // http://www.squaremobius.net/amqp.node/channel_api.html#confirmchannel_sendToQueue
  confirmChannel.sendToQueue(queueNameConfirm, Buffer.from(req.body.message), {}, (err, ok) => {
    if (err) {
      log(err || !ok);
      return res.sendStatus(500);
    }
    fetch(`http://127.0.0.1:${agentPort}`)
      .then(() => {
        res.status(201).send('OK');
      })
      .catch(err2 => {
        log(err2);
        res.sendStatus(500);
      });
  });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express RabbitMQ Publisher/Promises (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
