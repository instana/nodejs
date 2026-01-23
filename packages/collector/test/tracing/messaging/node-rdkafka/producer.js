/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../..')({});

const Kafka = require('node-rdkafka');

const agentPort = process.env.INSTANA_AGENT_PORT;
const logPrefix = `rdkafka Producer (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const express = require('express');
const port = require('../../../test_util/app-port')();
const enableDeliveryCb = process.env.RDKAFKA_PRODUCER_DELIVERY_CB === 'true';
const isStream = process.env.RDKAFKA_PRODUCER_AS_STREAM === 'true';

const app = express();
const topic = 'rdkafka-topic';
let throwDeliveryErr = false;
let producerIsReady = false;
let producerConnected = false;

function getProducer() {
  /** @type {Kafka.Producer | Kafka.ProducerStream} */
  let _producer;

  log(`Delivery callback enabled: ${enableDeliveryCb}`);

  const producerOptions = {
    'client.id': 'rdkafka-producer',
    'metadata.broker.list': process.env.KAFKA,
    // Enable to receive message payload in "delivery reports" event. This is the only way to know when a message
    // was successfully sent. But we cannot rely on it, nor set this option without the customer's knowledge.
    dr_cb: enableDeliveryCb
  };

  if (isStream) {
    _producer = Kafka.Producer.createWriteStream(
      producerOptions,
      {},
      {
        topic: topic,
        // This option is needed in order to use headers as Producer stream.
        // This information needs to be very clear in the documentation.
        // In the instrumentation we can check Buffer.isBuffer, like it's done here:
        // https://github.com/Blizzard/node-rdkafka/blob/master/lib/producer-stream.js#L232
        // Without this option, the stream expects only the message as a Buffer.
        objectMode: process.env.RDKAFKA_OBJECT_MODE === 'true'
      }
    );

    _producer.producer.on('ready', () => {
      log('Stream Producer is ready');
      producerIsReady = true;
      producerConnected = true;
    });

    _producer.producer.on('event.error', err => {
      log('Error from stream producer', err);
    });
  } else {
    _producer = new Kafka.Producer(producerOptions, {});

    const connect = () => {
      _producer.connect({}, err => {
        if (!err) {
          setTimeout(() => {
            producerConnected = true;
          }, 5000);
        } else {
          producerConnected = false;
          setTimeout(connect, 5000);
        }
      });
    };

    connect();

    // Any errors we encounter, including connection errors
    _producer.on('event.error', err => {
      log('Error from standard producer', err);
    });

    _producer.on('ready', () => {
      log('Standard Producer is ready');
      producerIsReady = true;
    });

    // This requires dr_cb option in order to work. When enabled, it gives us a confirmation that the message was
    // delivered successfully or not. This is handled by the instrumentation, if it's enabled.
    // Be aware that this only works for standard API - not for stream cases.
    _producer.on('delivery-report', err => {
      log('Received delivery report event', err);

      if (throwDeliveryErr) {
        const listenersArr = _producer.listeners('delivery-report');
        listenersArr.forEach(listener => {
          if (listener.name === 'instanaDeliveryReportListener') {
            _producer.removeListener('delivery-report', listener);

            listener(new Error('delivery fake error'));
          }
        });
      }
    });

    // We must either call .poll() manually after sending messages or set the producer to poll on an interval.
    // Without this, we do not get delivery events and the queue will eventually fill up.
    // TODO: Critical performance problems since 3.4.0
    // https://github.com/Blizzard/node-rdkafka/issues/1128
    // https://github.com/Blizzard/node-rdkafka/issues/1123#issuecomment-2855329479
    if (enableDeliveryCb) {
      _producer.setPollInterval(1000);
    }
  }

  return _producer;
}

let messageCounter = 0;
const producer = getProducer();

/**
 * @param {boolean} bufferErrorSender
 * @param {string} method
 * @param {string} msg
 * @returns {{ wasSent: boolean, topic: string, msg: string, timestamp: number }}
 */
function doProduce(bufferErrorSender = false, method, msg = 'Node rdkafka is great!') {
  msg = `${method} - ${msg}`;
  let theMessage = Buffer.from(msg);

  if (isStream) {
    if (bufferErrorSender) {
      // Message must be a buffer or null, so a number causes an error
      theMessage = 123;
    }

    return new Promise((resolve, reject) => {
      producer.once('error', err => {
        producer.close();
        reject(err);
      });

      log('Sending message as stream');

      let wasSent = false;
      /**
       * Producer as stream can only send an object (which we need in order to set the header) if the option objectMode
       * is provided: https://github.com/Blizzard/node-rdkafka/blob/master/lib/producer-stream.js#L59
       */
      try {
        wasSent = producer.write({
          topic: topic,
          headers: [{ message_counter: ++messageCounter }],
          value: theMessage
        });
      } catch (e) {
        // [ERR_INVALID_ARG_TYPE]: The "chunk" argument must be of type string or an instance of Buffer or
        // Uint8Array. Received an instance of Object
        // NOTE: Somehow this error is not thrown for Node < 14
      }

      log('Sent message as stream');

      setTimeout(async () => {
        await fetch(`http://127.0.0.1:${agentPort}/ping`);

        resolve({
          timestamp: Date.now(),
          wasSent,
          topic,
          msg: theMessage,
          messageCounter
        });
      }, 100);
    });
  } else {
    if (bufferErrorSender) {
      theMessage = 'invalid message as string';
    }

    return new Promise((resolve, reject) => {
      producer.on('error', reject);

      log('Sending message as standard on topic', topic);

      const wasSent = producer.produce(topic, null, theMessage, null, null, null, [
        { message_counter: ++messageCounter }
      ]);

      log('Sent message as standard', wasSent);

      setTimeout(async () => {
        await fetch(`http://127.0.0.1:${agentPort}/ping`);
        resolve({
          timestamp: Date.now(),
          wasSent,
          topic,
          msg: theMessage,
          messageCounter
        });
      }, 100);
    });
  }
}

// method is either standard or stream
app.get('/produce/:method', async (req, res) => {
  log('GET /produce/:method');

  const method = req.params.method;
  log(`Method: ${method}`);

  const bufferErrorSender = req.query.bufferErrorSender === 'true';
  throwDeliveryErr = req.query.throwDeliveryErr === 'true';

  try {
    const response = await doProduce(bufferErrorSender, method);
    res.status(200).send(response);
  } catch (err) {
    // NOTE: better not return 500 otherwise the test suite does not continue with checking expects
    //       const resp = await sendRequest -> expects success
    res.status(200).send({
      error: err.message
    });
  }
});

app.get('/', (_req, res) => {
  // If producer is a stream, it doesn't have a "isConnected" method, so we check if the method "writer" is available
  // otherwise. If the producer as stream fails to start, it throws an error before we even reach this piece of code.
  if (producerIsReady && producerConnected) {
    res.send('ok');
  } else {
    res.status(500).send('rdkafka Producer is not ready yet.');
  }
});

app.listen(port, () => {
  log(`rdkafka Producer app listening on port ${port} as stream: ${isStream}`);
});
