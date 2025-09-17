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

const amqp = require('amqplib/callback_api');
const a = require('async');
const bail = require('./amqpUtil').bail;
const exchange = require('./amqpUtil').exchange;
const queueName = require('./amqpUtil').queueName;
const queueNameGet = require('./amqpUtil').queueNameGet;
const queueNameConfirm = require('./amqpUtil').queueNameConfirm;
let channel;
let confirmChannel;

const bodyParser = require('body-parser');
const express = require('express');
const port = require('../../../test_util/app-port')();
const app = express();

// callback based amqp publisher
function publisher(conn) {
  const ok = conn.createChannel(onOpen);
  if (!ok) {
    bail(new Error('Could not create channel'));
  }
  function onOpen(onOpenErr, _channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        cb => {
          // queue for exchange (for publish)
          _channel.assertExchange(exchange, 'fanout', { durable: false }, err => {
            cb(err);
          });
        },
        cb => {
          // stand alone queue (for sendToQueue)
          _channel.assertQueue(queueName, { durable: false }, err => {
            cb(err);
          });
        },
        cb => {
          // stand alone queue (for get)
          _channel.assertQueue(queueNameGet, { durable: false, noAck: true }, err => {
            cb(err);
          });
        },
        cb => {
          _channel.purgeQueue(queueNameGet, err => {
            cb(err);
          });
        }
      ],
      err => {
        if (err) {
          return bail(err);
        }
        log('amqp connection established');
        channel = _channel;
      }
    );
  }
}

function publisherConfirm(conn) {
  const ok = conn.createConfirmChannel(onOpen);
  if (!ok) {
    bail(new Error('Could not create confirm channel'));
  }
  function onOpen(onOpenErr, _channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        cb => {
          _channel.assertQueue(queueNameConfirm, { durable: false }, err => {
            cb(err);
          });
        }
      ],
      err => {
        if (err) {
          return bail(err);
        }
        log('amqp connection (confirm) established');
        confirmChannel = _channel;
      }
    );
  }
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (channel && confirmChannel) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post('/publish', (req, res) => {
  // sendToQueue, publish et al. do not accept a callback because they do not
  // necessarily wait for any confirmation from RabbitMQ - see
  // https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  channel.publish(exchange, '', Buffer.from(req.body.message));

  fetch(`http://127.0.0.1:${agentPort}/ping`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err => {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/send-to-queue', (req, res) => {
  // sendToQueue, publish et al. do not accept a callback because they do not
  // necessarily wait for any confirmation from RabbitMQ - see
  // https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  channel.sendToQueue(queueName, Buffer.from(req.body.message));

  fetch(`http://127.0.0.1:${agentPort}/ping`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err => {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/send-to-get-queue', (req, res) => {
  // sendToQueue, publish et al. do not accept a callback because they do not
  // necessarily wait for any confirmation from RabbitMQ - see
  // https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  channel.sendToQueue(queueNameGet, Buffer.from(req.body.message));

  fetch(`http://127.0.0.1:${agentPort}/ping`)
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

  fetch(`http://127.0.0.1:${agentPort}/ping`)
    .then(() => {
      res.status(201).send('OK');
    })
    .catch(err2 => {
      log(err2);
      res.sendStatus(500);
    });
});

app.post('/send-to-confirm-queue', (req, res) => {
  confirmChannel.sendToQueue(queueNameConfirm, Buffer.from(req.body.message), {}, err => {
    if (err) {
      log(err);
      return res.sendStatus(500);
    }
    fetch(`http://127.0.0.1:${agentPort}/ping`)
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

amqp.connect(process.env.AMQP, (err, conn) => {
  if (err) {
    return bail(err);
  }
  publisher(conn);
  publisherConfirm(conn);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Express RabbitMQ Publisher/Callbacks (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
