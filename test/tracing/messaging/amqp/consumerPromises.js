/* eslint-disable no-console */

'use strict';

var agentPort = process.env.AGENT_PORT;

var instana = require('../../../../')({
  agentPort: agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var amqp = require('amqplib');
var request = require('request-promise');
var exchange = require('./amqpUtil').exchange;
var queueName = require('./amqpUtil').queueName;
var queueNameGet = require('./amqpUtil').queueNameGet;
var queueNameConfirm = require('./amqpUtil').queueNameConfirm;
var queueForExchangeName;
var connection;
var channel;
var confirmChannel;

// promise based consumer
amqp
  .connect('amqp://localhost')
  .then(function(_connection) {
    connection = _connection;
    return connection.createChannel();
  })
  .then(function(_channel) {
    channel = _channel;
    return channel.assertExchange(exchange, 'fanout', { durable: false });
  })
  .then(function() {
    // queue for exchange (for publish)
    return channel.assertQueue('', { exclusive: true, durable: false });
  })
  .then(function(queueForExchange) {
    // bind exchange and queue
    queueForExchangeName = queueForExchange.queue;
    return channel.bindQueue(queueForExchangeName, exchange, '');
  })
  .then(function() {
    return channel.consume(queueForExchangeName, function(msg) {
      if (msg !== null) {
        log(msg.content.toString());
        var span = instana.currentSpan();
        span.disableAutoEnd();
        // simulating asynchronous follow up steps with setTimout and request-promise
        setTimeout(function() {
          request('http://127.0.0.1:' + agentPort)
            .then(function() {
              span.end();
              channel.ack(msg);
            })
            .catch(function(err) {
              log(err);
              span.end(1);
              channel.nack(msg);
            });
        }, 100);
      }
    });
  })
  .then(function() {
    // stand alone queue (for sendToQueue)
    return channel.assertQueue(queueName, { durable: false });
  })
  .then(function() {
    return channel.consume(queueName, function(msg) {
      if (msg !== null) {
        log(msg.content.toString());
        var span = instana.currentSpan();
        span.disableAutoEnd();
        // simulating asynchronous follow up steps with setTimout and request-promise
        setTimeout(function() {
          request('http://127.0.0.1:' + agentPort)
            .then(function() {
              span.end();
              channel.ack(msg);
            })
            .catch(function(err) {
              log(err);
              span.end(1);
              channel.nack(msg);
            });
        }, 100);
      }
    });
  })
  .then(function() {
    // stand alone queue (for get)
    return channel.assertQueue(queueNameGet, { durable: false, noAck: true });
  })
  .then(function() {
    // poll a queue via get
    setInterval(function() {
      return channel
        .get(queueNameGet)
        .then(function(msg) {
          if (msg) {
            log('[channel#get] ', msg.content.toString());
            var span = instana.currentSpan();
            span.disableAutoEnd();
            // simulating asynchronous follow up steps with setTimout and request-promise
            setTimeout(function() {
              return request('http://127.0.0.1:' + agentPort)
                .then(function() {
                  span.end();
                  channel.ack(msg);
                })
                .catch(function(err) {
                  log(err);
                  span.end(1);
                  channel.nack(msg);
                });
            }, 100);
          }
        })
        .catch(function(err) {
          log('Error during channel#get', err);
        });
    }, 500);
  })
  .then(function() {
    return connection.createConfirmChannel();
  })
  .then(function(_confirmChannel) {
    confirmChannel = _confirmChannel;
    return confirmChannel.assertQueue(queueNameConfirm, { durable: false });
  })
  .then(function() {
    return confirmChannel.consume(queueNameConfirm, function(msg) {
      if (msg !== null) {
        log(msg.content.toString());
        var span = instana.currentSpan();
        span.disableAutoEnd();
        // simulating asynchronous follow up steps with setTimout and request-promise
        setTimeout(function() {
          request('http://127.0.0.1:' + agentPort)
            .then(function() {
              span.end();
              confirmChannel.ack(msg);
            })
            .catch(function(err) {
              log(err);
              span.end(1);
              confirmChannel.nack(msg);
            });
        });
      }
    });
  })
  .then(function() {
    log('amqp connection established');
  })
  .catch(console.warn);

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'RabbitMQ Consumer/Promises (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
