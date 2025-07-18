/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

const instana = require('../../../..')();
const fetch = require('node-fetch-v2');
const delay = require('../../../../../core/test/test_util/delay');
const agentPort = process.env.INSTANA_AGENT_PORT;
const { sendToParent } = require('@instana/core/test/test_util');
const Kafka = require('node-rdkafka');
const { v4: uuid } = require('uuid');
const logPrefix = `Node rdkafka Consumer (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const express = require('express');
const port = require('../../../test_util/app-port')();
const isStream = process.env.RDKAFKA_CONSUMER_AS_STREAM === 'true';

const app = express();

const topic = 'rdkafka-topic';
let consumerReady = false;

function setupConsumer() {
  /** @type {Kafka.KafkaConsumer | Kafka.ConsumerStream} */
  let _consumer;

  const consumerOptions = {
    'metadata.broker.list': process.env.KAFKA,
    'group.id': uuid(),
    'enable.auto.commit': false
  };

  if (isStream) {
    _consumer = Kafka.KafkaConsumer.createReadStream(
      consumerOptions,
      {},
      {
        topics: [topic],
        // NOTE: Receive either a single message or an array of messages
        streamAsBatch: false
      }
    );

    _consumer.consumer.on('error', err => {
      log('Consumer stream error:', err);
    });

    _consumer.consumer.on('ready', () => {
      log('Consumer stream ready.');
      consumerReady = true;
    });

    if (process.env.RDKAFKA_CONSUMER_ERROR && process.env.RDKAFKA_CONSUMER_ERROR === 'streamErrorReceiver') {
      _consumer.consumer.consume(1, (err, msg) => {
        if (err && err.message === 'KafkaConsumer is not connected') {
          setTimeout(() => {
            _consumer.emit('error', err);
          }, 500);
        } else {
          const unexpected = `Unexpected consume result, expected an error. Received message: ${JSON.stringify(
            msg
          )}, error: ${err}.`;
          // eslint-disable-next-line no-console
          console.log(unexpected);
          _consumer.emit('error', new Error(unexpected));
        }
      });
    }

    _consumer.on('data', async data => {
      log('Got stream message', data);

      const span = instana.currentSpan();
      span.disableAutoEnd();

      // "headers" may or may not be present in data.
      // It is an array of objects {key: value}.
      // The producer can set a value either as string or Buffer, but the response received by the consumer is always
      // a Uint8Array

      if (Array.isArray(data)) {
        data.forEach(sendToParent);
      } else {
        sendToParent(data);
      }

      await delay(200);
      await fetch(`http://127.0.0.1:${agentPort}`);
      span.end();
    });
  } else {
    _consumer = new Kafka.KafkaConsumer(consumerOptions, {
      'auto.offset.reset': 'earliest'
    });
    _consumer.connect();

    _consumer.on('ready', () => {
      function startConsuming() {
        _consumer.getMetadata(null, (err, metadata) => {
          let foundTopic = false;
          metadata.topics.forEach(topicMetadata => {
            if (topicMetadata.name === topic) {
              log(`Topic exist ${topic}:`, topicMetadata);
              log('Consumer Standard Ready.');
              foundTopic = true;
            }
          });

          if (!foundTopic) {
            log('Retrying...topic not found', topic);
            startConsuming();
            return;
          }

          setTimeout(() => {
            consumerReady = true;
            log('Subscribing to topic', topic);
            _consumer.subscribe([topic]);

            // Consume from the rdkafka-topic. This is what determines
            // the mode we are running in. By not specifying a callback (or specifying
            // only a callback) we get messages as soon as they are available.
            _consumer.consume();

            // Even if we use this, messages are received one by one.
            // This basically means: wait until we have 5 messages and consume them
            // So we can assure that the consumer as standard api (not as stream)
            // will always spit 1 message at a time.
            // setInterval(function () {
            //  _consumer.consume(5);
            // }, 100);

            _consumer.once('disconnected', () => {
              log('Consumer got disconnected');
            });

            _consumer.on('data', async data => {
              log('Got standard message', data);

              const span = instana.currentSpan();
              span.disableAutoEnd();

              // "headers" may or may not be present in data.
              // it is an array of objects {key: value}.
              // the producer can set a value either as string or
              // Buffer, but the response received by the consumer is always
              // a Uint8Array
              sendToParent(data);

              await delay(200);
              await fetch(`http://127.0.0.1:${agentPort}`);
              span.end();
            });
          }, 2 * 1000);
        });
      }

      startConsuming();
    });

    _consumer.on('error', err => {
      log('Consumer Standard error:', err);
    });
  }

  return _consumer;
}

setupConsumer();

app.get('/', (_req, res) => {
  if (consumerReady) {
    res.send('ok');
  } else {
    res.status(500).send('rdkafka Consumer is not ready yet.');
  }
});

app.listen(port, () =>
  log(`rdkafka Consumer (as ${isStream ? 'Stream' : 'Standard API'}) app listening on port ${port}`)
);
