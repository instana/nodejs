/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable no-console */
/* eslint-disable instana/no-unsafe-require */
/* eslint-disable import/no-extraneous-dependencies */

'use strict';

require('./tracing');

const { propagation, context, trace } = require('@opentelemetry/api');
const { Kafka } = require('kafkajs');
const express = require('express');
const port = process.env.PORT || '6215';
const app = express();

const broker = process.env.KAFKA_BROKER || '127.0.0.1:9092';
const kafkaTopic = 'otel-kafka-test-1';
const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: [broker],
  retry: {
    initialRetryTime: 500,
    retries: 0
  }
});

const producer = kafka.producer();

(async function connect() {
  await producer.connect();
})();

function withUserId(userId, fn) {
  const baggage = propagation.createBaggage({ userId: { value: userId } });
  // Also set userId on the currently active (entry) span directly,
  // because BaggageSpanProcessor only runs on span *start* – the entry span
  // is already open at this point so it won't pick up the baggage automatically.
  trace.getActiveSpan()?.setAttribute('userId', userId);
  return context.with(propagation.setBaggage(context.active(), baggage), fn);
}

app.post('/kafka-msg', async (req, res) => {
  await withUserId('12345', async () => {
    await producer.send({
      topic: kafkaTopic,
      messages: [{ value: 'my-value' }]
    });
  });

  res.status(200).send({ success: true });
});

app.get('/http', async (req, res) => {
  await withUserId('12345', async () => {
    await fetch('https://www.instana.com');
  });

  res.status(200).send({ success: true });
});

app.listen(port, () => {
  console.log(`js standalone app started at port ${port}`);
});
