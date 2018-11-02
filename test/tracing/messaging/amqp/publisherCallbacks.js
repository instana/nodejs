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

var amqp = require('amqplib/callback_api');
var a = require('async');
var bail = require('./amqpUtil').bail;
var exchange = require('./amqpUtil').exchange;
var queueName = require('./amqpUtil').queueName;
var queueNameGet = require('./amqpUtil').queueNameGet;
var queueNameConfirm = require('./amqpUtil').queueNameConfirm;
var channel;
var confirmChannel;

var request = require('request-promise');
var bodyParser = require('body-parser');
var express = require('express');
var app = express();

// callback based amqp publisher
function publisher(conn) {
  var ok = conn.createChannel(onOpen);
  if (!ok) {
    bail(new Error('Could not create channel'));
  }
  function onOpen(onOpenErr, _channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        function(cb) {
          // queue for exchange (for publish)
          _channel.assertExchange(exchange, 'fanout', { durable: false }, function(err) {
            cb(err);
          });
        },
        function(cb) {
          // stand alone queue (for sendToQueue)
          _channel.assertQueue(queueName, { durable: false }, function(err) {
            cb(err);
          });
        },
        function(cb) {
          // stand alone queue (for get)
          _channel.assertQueue(queueNameGet, { durable: false, noAck: true }, function(err) {
            cb(err);
          });
        },
        function(cb) {
          _channel.purgeQueue(queueNameGet, function(err) {
            cb(err);
          });
        }
      ],
      function(err) {
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
  var ok = conn.createConfirmChannel(onOpen);
  if (!ok) {
    bail(new Error('Could not create confirm channel'));
  }
  function onOpen(onOpenErr, _channel) {
    if (onOpenErr) {
      return bail(onOpenErr);
    }

    a.waterfall(
      [
        function(cb) {
          _channel.assertQueue(queueNameConfirm, { durable: false }, function(err) {
            cb(err);
          });
        }
      ],
      function(err) {
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

app.get('/', function(req, res) {
  if (channel && confirmChannel) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post('/publish', function(req, res) {
  // sendToQueue, publish et al. do not accept a callback because they do not
  // necessarily wait for any confirmation from RabbitMQ - see
  // https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
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
  // sendToQueue, publish et al. do not accept a callback because they do not
  // necessarily wait for any confirmation from RabbitMQ - see
  // https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
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
  // sendToQueue, publish et al. do not accept a callback because they do not
  // necessarily wait for any confirmation from RabbitMQ - see
  // https://github.com/squaremo/amqp.node/issues/89#issuecomment-62632326
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
  confirmChannel.sendToQueue(queueNameConfirm, Buffer.from(req.body.message), {}, function(err) {
    if (err) {
      log(err);
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

amqp.connect(
  'amqp://localhost',
  function(err, conn) {
    if (err) {
      return bail(err);
    }
    publisher(conn);
    publisherConfirm(conn);
  }
);

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Express RabbitMQ Publisher/Callbacks (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
