/* eslint-disable no-console */

'use strict';

var agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort: agentPort,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var amqp = require('amqplib');
var exchange = require('./amqpUtil').exchange;
var queueName = require('./amqpUtil').queueName;
var queueNameGet = require('./amqpUtil').queueNameGet;
var queueNameConfirm = require('./amqpUtil').queueNameConfirm;
var connection;
var channel;
var confirmChannel;

var request = require('request-promise');
var bodyParser = require('body-parser');
var express = require('express');
var app = express();

// promise based amqp publisher
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
    // stand alone queue (for sendToQueue)
    return channel.assertQueue(queueName, { durable: false });
  })
  .then(function() {
    // stand alone queue (for get)
    return channel.assertQueue(queueNameGet, { durable: false, noAck: true });
  })
  .then(function() {
    return channel.purgeQueue(queueNameGet);
  })
  .then(function() {
    return connection.createConfirmChannel();
  })
  .then(function(_confirmChannel) {
    confirmChannel = _confirmChannel;
    return confirmChannel.assertQueue(queueNameConfirm, { durable: false });
  })
  .then(function() {
    log('amqp connection established');
  })
  .catch(console.warn);

app.use(bodyParser.json());

app.get('/', function(req, res) {
  if (channel && confirmChannel) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post('/publish', function(req, res) {
  // sendToQueue, publish et al. do not return a promise because they do not necessarily wait for any confirmation from
  // RabbitMQ - see https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  channel.publish(exchange, '', Buffer.from(req.body.message));

  request('http://127.0.0.1:' + agentPort)
    .then(function() {
      res.status(201).send('OK');
    })
    .catch(function(err) {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/send-to-queue', function(req, res) {
  // sendToQueue, publish et al. do not return a promise because they do not necessarily wait for any confirmation from
  // RabbitMQ - see https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  channel.sendToQueue(queueName, Buffer.from(req.body.message));

  request('http://127.0.0.1:' + agentPort)
    .then(function() {
      res.status(201).send('OK');
    })
    .catch(function(err) {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/send-to-get-queue', function(req, res) {
  // sendToQueue, publish et al. do not return a promise because they do not necessarily wait for any confirmation from
  // RabbitMQ - see https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
  log('sending to', queueNameGet);
  channel.sendToQueue(queueNameGet, Buffer.from(req.body.message));

  request('http://127.0.0.1:' + agentPort)
    .then(function() {
      res.status(201).send('OK');
    })
    .catch(function(err) {
      log(err);
      res.sendStatus(500);
    });
});

app.post('/send-to-confirm-queue', function(req, res) {
  // Even with a ConfirmChannel and even in the promise API case, sendToQueue/publish do not return a promise, but only
  // accept a callback, see
  // http://www.squaremobius.net/amqp.node/channel_api.html#confirmchannel_sendToQueue
  confirmChannel.sendToQueue(queueNameConfirm, Buffer.from(req.body.message), {}, function(err, ok) {
    if (err) {
      log(err || !ok);
      return res.sendStatus(500);
    }
    request('http://127.0.0.1:' + agentPort)
      .then(function() {
        res.status(201).send('OK');
      })
      .catch(function(err2) {
        log(err2);
        res.sendStatus(500);
      });
  });
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Express RabbitMQ Publisher/Promises (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
