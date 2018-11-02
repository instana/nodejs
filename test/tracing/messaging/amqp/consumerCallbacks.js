/* eslint-disable no-console, strict */

var agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort: agentPort,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var amqp = require('amqplib/callback_api');
var a = require('async');
var request = require('request-promise');
var bail = require('./amqpUtil').bail;
var exchange = require('./amqpUtil').exchange;
var queueName = require('./amqpUtil').queueName;
var queueNameGet = require('./amqpUtil').queueNameGet;
var queueNameConfirm = require('./amqpUtil').queueNameConfirm;
var queueForExchangeName;

// callback based amqp consumer
function consumer(conn) {
  var ok = conn.createChannel(onOpen);
  if (!ok) {
    return bail(new Error('Could not create channel'));
  }
  function onOpen(onOpenErr, channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        function(cb) {
          // set up exchange (for publish)
          channel.assertExchange(exchange, 'fanout', { durable: false }, function(err) {
            cb(err);
          });
        },
        function(cb) {
          // queue for exchange (for publish)
          channel.assertQueue('', { exclusive: true, durable: false }, function(err, queueForExchange) {
            cb(err, queueForExchange);
          });
        },
        function(queueForExchange, cb) {
          // bind exchange and queue
          queueForExchangeName = queueForExchange.queue;
          channel.bindQueue(queueForExchangeName, exchange, '', null, function(err) {
            cb(err);
          });
        },
        function(cb) {
          // stand alone queue (for sendToQueue)
          channel.assertQueue(queueName, { durable: false }, function(err) {
            cb(err);
          });
        },
        function(cb) {
          // stand alone queue (for get)
          channel.assertQueue(queueNameGet, { durable: false, noAck: true }, function(err) {
            cb(err);
          });
        }
      ],
      function(err) {
        if (err) {
          return bail(err);
        }
        log('amqp connection established');
        channel.consume(queueForExchangeName, function(msg) {
          if (msg !== null) {
            log(msg.content.toString());
            request('http://127.0.0.1:' + agentPort)
              .then(function() {
                channel.ack(msg);
              })
              .catch(function(err2) {
                log(err2);
                channel.nack(msg);
              });
          }
        });
        channel.consume(queueName, function(msg) {
          if (msg !== null) {
            log(msg.content.toString());
            request('http://127.0.0.1:' + agentPort)
              .then(function() {
                channel.ack(msg);
              })
              .catch(function(err3) {
                log(err3);
                channel.nack(msg);
              });
          }
        });
        // poll a queue via get
        setInterval(function() {
          return channel.get(queueNameGet, null, function(e, msg) {
            if (e) {
              return log('Error during channel#get', e);
            }
            if (msg) {
              log('[channel#get] ', msg.content.toString());
              request('http://127.0.0.1:' + agentPort)
                .then(function() {
                  channel.ack(msg);
                })
                .catch(function(e2) {
                  log(e2);
                  channel.nack(msg);
                });
            }
          });
        }, 500);
      }
    ); // a.waterfall
  }
}

function consumerConfirm(conn) {
  var ok = conn.createConfirmChannel(onOpen);
  if (!ok) {
    return bail(new Error('Could not create confirm channel'));
  }
  function onOpen(onOpenErr, channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        function(cb) {
          channel.assertQueue(queueNameConfirm, { durable: false }, function(err) {
            cb(err);
          });
        }
      ],
      function(err) {
        if (err) {
          return bail(err);
        }
        log('amqp connection (confirm) established');
        channel.consume(queueNameConfirm, function(msg) {
          if (msg !== null) {
            log(msg.content.toString());
            request('http://127.0.0.1:' + agentPort)
              .then(function() {
                channel.ack(msg);
              })
              .catch(function(e2) {
                log(e2);
                channel.nack(msg);
              });
          }
        });
      }
    ); // a.waterfall
  }
}

amqp.connect(
  'amqp://localhost',
  function(err, conn) {
    if (err != null) {
      return bail(err);
    }
    consumer(conn);
    consumerConfirm(conn);
  }
);

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'RabbitMQ Consumer/Callbacks (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
