/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.GCP_PROJECT;
const googleApplicationCredentialsContent = process.env.GOOGLE_APPLICATION_CREDENTIALS_CONTENT;
const topicName = process.env.GCP_PUBSUB_TOPIC || 'nodejs-test-topic';
const subscriptionName = process.env.GCP_PUBSUB_SUBSCRIPTION || 'nodejs-test-subscription';

exports.createTopic = async function createTopic(log) {
  if (!projectId) {
    throw new Error('No GCP project ID has been set.');
  }

  try {
    const options = { projectId };
    if (googleApplicationCredentialsContent) {
      log('Using GCP credentials directly from GOOGLE_APPLICATION_CREDENTIALS_CONTENT.');
      options.credentials = JSON.parse(googleApplicationCredentialsContent);
    } else {
      log('Using default GCP credentials.');
    }
    const pubsub = new PubSub(options);

    log('connecting to Google Cloud PubSub');
    log(`checking for topic ${topicName}`);

    const [topics] = await pubsub.getTopics();
    let topic = topics.filter(top => new RegExp(`/${topicName}$`).test(top.name))[0];
    if (topic) {
      log(`topic ${topic.name} already exists, using it`);
    } else {
      log(`creating topic ${topicName}`);
      [topic] = await pubsub.createTopic(topicName);
      log(`topic ${topic.name} created`);
    }

    return { pubsub, topic };
  } catch (e) {
    log(e);
    throw new Error(`Could not connect to Google Cloud PubSub: ${e.message}.`);
  }
};

exports.createTopicAndSubscription = async function createTopicAndSubscription(log) {
  try {
    const { pubsub, topic } = await exports.createTopic(log);

    log(`checking for subscription ${subscriptionName}`);
    const [subscriptions] = await pubsub.getSubscriptions();
    let subscription = subscriptions.filter(sub => new RegExp(`/${subscriptionName}$`).test(sub.name))[0];
    if (subscription) {
      log(`subscription ${subscription.name} already exists, using it`);
      log('purging existing messages now');
      await subscription.seek(new Date()); // avoid receiving old messages from previous tests
      log('purging existing messages: done');
    } else {
      log(`creating subscription ${subscriptionName}`);
      [subscription] = await topic.createSubscription(subscriptionName);
      log(`subscription ${subscription.name} created`);
    }
    log('connected');

    return { pubsub, topic, subscription };
  } catch (e) {
    log(e);
    throw new Error(`Could not connect to Google Cloud PubSub: ${e.message} ${e.stack}.`);
  }
};
