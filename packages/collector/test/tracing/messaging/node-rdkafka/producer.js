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
const fetch = require('node-fetch-v2');
const agentPort = process.env.INSTANA_AGENT_PORT;
const logPrefix = `rdkafka Producer (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const port = require('../../../test_util/app-port')();
const enableDeliveryCb = process.env.RDKAFKA_PRODUCER_DELIVERY_CB === 'true';

const app = express();

const topic = 'rdkafka-topic';

let throwDeliveryErr = false;

function getProducer(isStream = false) {
  /** @type {Kafka.Producer | Kafka.ProducerStream} */
  let _producer;
  const producerOptions = {
    'client.id': 'rdkafka-producer',
    'metadata.broker.list': '127.0.0.1:9092',
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
  } else {
    _producer = new Kafka.Producer(producerOptions, {});

    _producer.connect();

    // Any errors we encounter, including connection errors
    _producer.on('event.error', err => {
      log('Error from producer', err);
    });

    // This requires dr_cb option in order to work. When enabled, it gives us a confirmation that the message was
    // delivered successfully or not. This is handled by the instrumentation, if it's enabled.
    // Be aware that this only works for standard API - not for stream cases.
    _producer.on('delivery-report', () => {
      log('Delivery report');

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
    _producer.setPollInterval(100);
  }

  return _producer;
}

let messageCounter = 0;

/**
 * @param {Kafka.Producer | Kafka.ProducerStream} _producer
 * @param {string} msg
 * @returns {{ wasSent: boolean, topic: string, msg: string, timestamp: number }}
 */
function doProduce(_producer, isStream, bufferErrorSender = false, msg = 'Node rdkafka is great!') {
  let theMessage = Buffer.from(msg);

  if (isStream) {
    if (bufferErrorSender) {
      // Message must be a buffer or null, so a number causes an error
      theMessage = 123;
    }

    return new Promise((resolve, reject) => {
      _producer.once('error', err => {
        _producer.close();
        reject(err);
      });

      log('Sending message as stream');

      let wasSent = false;
      /**
       * Producer as stream can only send an object (which we need in order to set the header) if the option objectMode
       * is provided: https://github.com/Blizzard/node-rdkafka/blob/master/lib/producer-stream.js#L59
       */
      try {
        wasSent = _producer.write({
          topic: topic,
          headers: [{ message_counter: ++messageCounter }],
          value: theMessage
        });
      } catch (e) {
        // [ERR_INVALID_ARG_TYPE]: The "chunk" argument must be of type string or an instance of Buffer or
        // Uint8Array. Received an instance of Object
        // NOTE: Somehow this error is not thrown for Node < 14
      }

      setTimeout(async () => {
        await fetch(`http://127.0.0.1:${agentPort}`);

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
      _producer.on('error', reject);

      log('Sending message as standard');

      const wasSent = _producer.produce(topic, null, theMessage, null, null, null, [
        { message_counter: ++messageCounter }
      ]);

      setTimeout(async () => {
        await fetch(`http://127.0.0.1:${agentPort}`);

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

const standardProducer = getProducer(false);
let streamProducer = getProducer(true);

// method is either standard or stream
app.get('/produce/:method', async (req, res) => {
  log('GET /produce/:method');

  const method = req.params.method || 'standard';
  const bufferErrorSender = req.query.bufferErrorSender === 'true';

  throwDeliveryErr = req.query.throwDeliveryErr === 'true';

  try {
    const response = await doProduce(
      method === 'stream' ? streamProducer : standardProducer,
      method === 'stream',
      bufferErrorSender
    );
    res.status(200).send(response);
  } catch (err) {
    /**
     * According to the Node.js spec, if a writable stream receives the 'error' event, the only valid event by then is
     * 'close'. So we create a new stream after an error occurs.
     *
     * From the Node.js docs (https://nodejs.org/dist/latest-v16.x/docs/api/stream.html#event-error):
     *
     * The 'error' event is emitted if an error occurred while writing or piping data. The listener callback is passed a
     * single Error argument when called.
     *
     * The stream is closed when the 'error' event is emitted unless the autoDestroy option was set to false when
     * creating the stream.
     *
     * After 'error', no further events other than 'close' should be emitted (including 'error' events).
     */
    if (method === 'stream') {
      streamProducer = getProducer(true);
    }

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
  if (streamProducer.write && standardProducer.isConnected()) {
    res.send('ok');
  } else {
    res.status(500).send('rdkafka Producer is not ready yet.');
  }
});

app.listen(port, () => {
  log(`rdkafka Producer app listening on port ${port}`);
});
