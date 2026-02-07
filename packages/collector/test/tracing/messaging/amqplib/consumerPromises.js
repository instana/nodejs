/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

const agentPort = process.env.AGENT_PORT;
const instana = require('@instana/collector')({
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
let queueForExchangeName;
let connection;
let channel;
let confirmChannel;

// promise based consumer
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
    // queue for exchange (for publish)
    channel.assertQueue('', { exclusive: true, durable: false })
  )
  .then(queueForExchange => {
    // bind exchange and queue
    queueForExchangeName = queueForExchange.queue;
    return channel.bindQueue(queueForExchangeName, exchange, '');
  })
  .then(() =>
    channel.consume(queueForExchangeName, msg => {
      if (msg !== null) {
        log(msg.content.toString());
        const span = instana.currentSpan();
        span.disableAutoEnd();
        // simulating asynchronous follow up steps with setTimeout
        setTimeout(() => {
          fetch(`http://127.0.0.1:${agentPort}/ping`)
            .then(() => {
              span.end();
              channel.ack(msg);
            })
            .catch(err => {
              log(err);
              span.end(1);
              channel.nack(msg);
            });
        }, 100);
      }
    })
  )
  .then(() =>
    // stand alone queue (for sendToQueue)
    channel.assertQueue(queueName, { durable: false })
  )
  .then(() =>
    channel.consume(queueName, msg => {
      if (msg !== null) {
        log(msg.content.toString());
        const span = instana.currentSpan();
        span.disableAutoEnd();
        // simulating asynchronous follow up steps with setTimeout
        setTimeout(() => {
          fetch(`http://127.0.0.1:${agentPort}/ping`)
            .then(() => {
              span.end();
              channel.ack(msg);
            })
            .catch(err => {
              log(err);
              span.end(1);
              channel.nack(msg);
            });
        }, 100);
      }
    })
  )
  .then(() =>
    // stand alone queue (for get)
    channel.assertQueue(queueNameGet, { durable: false, noAck: true })
  )
  .then(() => {
    // poll a queue via get
    setInterval(
      () =>
        channel
          .get(queueNameGet)
          .then(msg => {
            if (msg) {
              log('[channel#get] ', msg.content.toString());
              const span = instana.currentSpan();
              span.disableAutoEnd();
              // simulating asynchronous follow up steps with setTimeout
              setTimeout(
                () =>
                  fetch(`http://127.0.0.1:${agentPort}/ping`)
                    .then(() => {
                      span.end();
                      channel.ack(msg);
                    })
                    .catch(err => {
                      log(err);
                      span.end(1);
                      channel.nack(msg);
                    }),
                100
              );
            }
          })
          .catch(err => {
            log('Error during channel#get', err);
          }),
      500
    );
  })
  .then(() => connection.createConfirmChannel())
  .then(_confirmChannel => {
    confirmChannel = _confirmChannel;
    return confirmChannel.assertQueue(queueNameConfirm, { durable: false });
  })
  .then(() =>
    confirmChannel.consume(queueNameConfirm, msg => {
      if (msg !== null) {
        log(msg.content.toString());
        const span = instana.currentSpan();
        span.disableAutoEnd();
        // simulating asynchronous follow up steps with setTimeout
        setTimeout(() => {
          fetch(`http://127.0.0.1:${agentPort}/ping`)
            .then(() => {
              span.end();
              confirmChannel.ack(msg);
            })
            .catch(err => {
              log(err);
              span.end(1);
              confirmChannel.nack(msg);
            });
        }, 100);
      }
    })
  )
  .then(() => {
    log('amqp connection established');
    process.send && process.send('amqp.initialized');
  })
  .catch(console.warn);

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `RabbitMQ Consumer/Promises (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
