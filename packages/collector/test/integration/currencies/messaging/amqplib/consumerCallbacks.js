/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console, strict */

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

const amqp = require('amqplib/callback_api');
const a = require('async');

const bail = require('./amqpUtil').bail;
const exchange = require('./amqpUtil').exchange;
const queueName = require('./amqpUtil').queueName;
const queueNameGet = require('./amqpUtil').queueNameGet;
const queueNameConfirm = require('./amqpUtil').queueNameConfirm;
let queueForExchangeName;

// callback based amqp consumer
function consumer(conn) {
  const ok = conn.createChannel(onOpen);
  if (!ok) {
    return bail(new Error('Could not create channel'));
  }
  function onOpen(onOpenErr, channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        cb => {
          // set up exchange (for publish)
          channel.assertExchange(exchange, 'fanout', { durable: false }, err => {
            cb(err);
          });
        },
        cb => {
          // queue for exchange (for publish)
          channel.assertQueue('', { exclusive: true, durable: false }, (err, queueForExchange) => {
            cb(err, queueForExchange);
          });
        },
        (queueForExchange, cb) => {
          // bind exchange and queue
          queueForExchangeName = queueForExchange.queue;
          channel.bindQueue(queueForExchangeName, exchange, '', null, err => {
            cb(err);
          });
        },
        cb => {
          // stand alone queue (for sendToQueue)
          channel.assertQueue(queueName, { durable: false }, err => {
            cb(err);
          });
        },
        cb => {
          // stand alone queue (for get)
          channel.assertQueue(queueNameGet, { durable: false, noAck: true }, err => {
            cb(err);
          });
        }
      ],
      err => {
        if (err) {
          return bail(err);
        }

        channel.consume(queueForExchangeName, msg => {
          const span = instana.currentSpan();
          span.disableAutoEnd();
          if (msg !== null) {
            log(msg.content.toString());
            // simulating asynchronous follow up steps with setTimeout
            setTimeout(() => {
              fetch(`http://127.0.0.1:${agentPort}/ping`)
                .then(() => {
                  span.end();
                  channel.ack(msg);
                })
                .catch(err2 => {
                  log(err2);
                  span.end(1);
                  channel.nack(msg);
                });
            }, 100);
          }
        });

        channel.consume(queueName, msg => {
          const span = instana.currentSpan();
          span.disableAutoEnd();
          if (msg !== null) {
            log(msg.content.toString());
            // simulating asynchronous follow up steps with setTimeout
            setTimeout(() => {
              fetch(`http://127.0.0.1:${agentPort}/ping`)
                .then(() => {
                  span.end();
                  channel.ack(msg);
                })
                .catch(err3 => {
                  log(err3);
                  span.end(1);
                  channel.nack(msg);
                });
            }, 100);
          }
        });

        // poll a queue via get
        setInterval(
          () =>
            channel.get(queueNameGet, null, (e, msg) => {
              if (e) {
                return log('Error during channel#get', e);
              }
              if (msg) {
                log('[channel#get] ', msg.content.toString());
                const span = instana.currentSpan();
                span.disableAutoEnd();
                // simulating asynchronous follow up steps with setTimeout
                setTimeout(() => {
                  fetch(`http://127.0.0.1:${agentPort}/ping`)
                    .then(() => {
                      span.end();
                      channel.ack(msg);
                    })
                    .catch(e2 => {
                      log(e2);
                      span.end(1);
                      channel.nack(msg);
                    });
                }, 100);
              }
            }),
          500
        );

        log('amqp connection established');
        process.send && process.send('amqp.initialized');
      }
    ); // a.waterfall
  }
}

function consumerConfirm(conn) {
  const ok = conn.createConfirmChannel(onOpen);
  if (!ok) {
    return bail(new Error('Could not create confirm channel'));
  }
  function onOpen(onOpenErr, channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        cb => {
          channel.assertQueue(queueNameConfirm, { durable: false }, err => {
            cb(err);
          });
        }
      ],
      err => {
        if (err) {
          return bail(err);
        }
        log('amqp connection (confirm) established');
        channel.consume(queueNameConfirm, msg => {
          const span = instana.currentSpan();
          span.disableAutoEnd();
          if (msg !== null) {
            log(msg.content.toString());
            // simulating asynchronous follow up steps with setTimeout
            setTimeout(() => {
              fetch(`http://127.0.0.1:${agentPort}/ping`)
                .then(() => {
                  span.end();
                  channel.ack(msg);
                })
                .catch(e2 => {
                  log(e2);
                  span.end(1);
                  channel.nack(msg);
                });
            }, 100);
          }
        });
      }
    ); // a.waterfall
  }
}

amqp.connect(process.env.INSTANA_CONNECT_RABBITMQ_AMQP, (err, conn) => {
  if (err != null) {
    return bail(err);
  }
  consumer(conn);
  consumerConfirm(conn);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `RabbitMQ Consumer/Callbacks (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
