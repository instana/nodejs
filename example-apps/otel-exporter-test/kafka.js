/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'otel-node-app',
  // HOST MACHINE:
  brokers: ['localhost:9092']
  // DOCKER:
  // brokers: ['kafka:29092'],
});

const producer = kafka.producer();
const consumer = kafka.consumer({
  groupId: 'otel-group'
});

const TOPIC = 'test-topic';

let producerConnected = false;
let consumerStarted = false;

async function connectProducer() {
  if (!producerConnected) {
    await producer.connect();
    producerConnected = true;
    // eslint-disable-next-line no-console
    console.log('Kafka producer connected');
  }
}

async function sendKafkaMessage(message) {
  await connectProducer();

  await producer.send({
    topic: TOPIC,
    messages: [
      {
        key: 'sample-key',
        value: JSON.stringify(message)
      }
    ]
  });

  // eslint-disable-next-line no-console
  console.log('Kafka message sent');
}

async function startKafkaConsumer() {
  if (consumerStarted) {
    return;
  }

  await consumer.connect();

  await consumer.subscribe({
    topic: TOPIC,
    fromBeginning: true
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const value = message.value?.toString();

      // eslint-disable-next-line no-console
      console.log('--------------------------------');
      // eslint-disable-next-line no-console
      console.log('Kafka message received');
      // eslint-disable-next-line no-console
      console.log('Topic:', topic);
      // eslint-disable-next-line no-console
      console.log('Partition:', partition);
      // eslint-disable-next-line no-console
      console.log('Value:', value);
      // eslint-disable-next-line no-console
      console.log('--------------------------------');
    }
  });

  consumerStarted = true;
  // eslint-disable-next-line no-console
  console.log('Kafka consumer started');
}

module.exports = {
  sendKafkaMessage,
  startKafkaConsumer
};

// Made with Bob
