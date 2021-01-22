/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2018
 */

/* eslint-disable no-console */

'use strict';

const agentPort = process.env.AGENT_PORT;

require('../../../../')({
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

const request = require('request-promise');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();

// promise based amqp publisher
amqp
  .connect('amqp://localhost')
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

  request(`http://127.0.0.1:${agentPort}`)
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

  request(`http://127.0.0.1:${agentPort}`)
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

  request(`http://127.0.0.1:${agentPort}`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err => {
      log(err);
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
    request(`http://127.0.0.1:${agentPort}`)
      .then(() => {
        res.status(201).send('OK');
      })
      .catch(err2 => {
        log(err2);
        res.sendStatus(500);
      });
  });
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express RabbitMQ Publisher/Promises (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
