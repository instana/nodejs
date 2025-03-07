/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { Kafka } = require('kafkajs');
const { delay } = require('../../../core/test/test_util');

const kafka = new Kafka({
  clientId: 'test-client',
  brokers: [process.env.KAFKA],
  retry: {
    initialRetryTime: 500,
    retries: 5
  }
});

const admin = kafka.admin();

/**
 * @param {string[]} topics
 */
const createTopics = async topics => {
  if (!topics || topics.length === 0) {
    return;
  }

  await admin.connect();

  const existingTopics = await admin.listTopics();
  const topicsToCreate = topics.filter(topic => !existingTopics.includes(topic));

  if (topicsToCreate.length > 0) {
    await admin.createTopics({
      topics: topicsToCreate.map(topic => ({
        topic,
        numPartitions: 1,
        replicationFactor: 1
      }))
    });
  }
  delay(500);
  // eslint-disable-next-line no-console
  console.log('Topics created successfully:', topics);
  await admin.disconnect();
};

module.exports = { createTopics };
