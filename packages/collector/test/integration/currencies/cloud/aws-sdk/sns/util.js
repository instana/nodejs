/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');

function getLocalstackEndpoint() {
  if (process.env.RUN_AWS === 'true') return null;
  let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS;
  if (!endpoint) return null;
  if (endpoint.startsWith('localstack://')) {
    endpoint = endpoint.replace('localstack://', 'http://');
  }
  return endpoint;
}

function getClientConfig() {
  const endpoint = getLocalstackEndpoint();
  if (endpoint) {
    return {
      region: 'us-east-2',
      endpoint,
      accessKeyId: 'test',
      secretAccessKey: 'test'
    };
  }
  return { region: 'us-east-2' };
}

/**
 * Normalises a queue URL returned by localstack (which uses the cloud hostname
 * sqs.<region>.localhost.localstack.cloud:<port>) to the plain localhost URL that
 * matches the configured endpoint, so AWS SDK v2 routes the request correctly.
 */
exports.normaliseQueueUrl = function normaliseQueueUrl(queueUrl) {
  const endpoint = getLocalstackEndpoint();
  if (!endpoint || !queueUrl) return queueUrl;
  // Replace the localstack cloud hostname with the plain endpoint host:port
  const endpointUrl = new URL(endpoint);
  return queueUrl.replace(/https?:\/\/[^/]+/, `${endpointUrl.protocol}//${endpointUrl.host}`);
};

AWS.config.update({ region: 'us-east-2' });
exports.getClientConfig = getClientConfig;
const sns = new AWS.SNS(getClientConfig());
const sqs = new AWS.SQS(getClientConfig());

function getPolicy(topicArn, queueArn) {
  const policy = {
    Version: '2008-10-17',
    Id: '__default_policy_ID',
    Statement: [
      {
        Sid: `topic-subscription-${topicArn}`,
        Effect: 'Allow',
        Principal: { AWS: '*' },
        Action: 'SQS:SendMessage',
        Resource: queueArn,
        Condition: {
          ArnLike: { 'aws:SourceArn': topicArn }
        }
      }
    ]
  };
  return JSON.stringify(policy);
}

exports.createSQSQueue = function createSQSQueue(queueName) {
  return sqs
    .createQueue({
      QueueName: queueName
    })
    .promise();
};

/**
 * Attempts to delete a previous created topic and SQS subscriber queue before the test starts
 * @param {string} topicArn
 * @param {string} queueURL
 */
exports.cleanup = async function (topicArn, queueURL) {
  try {
    if (topicArn) {
      await sns
        .deleteTopic({
          TopicArn: topicArn
        })
        .promise();
    }

    if (queueURL) {
      await sqs
        .deleteQueue({
          QueueUrl: queueURL
        })
        .promise();
    }
  } catch (err) {
    return Promise.resolve('Error cleaning up the topic and queue', err);
  }
};

/**
 * * Creates an SQS queue to subscribe to SNS
 * * Creates the SNS topic
 * * Subscribes the SQS queue to the SNS topic
 * @returns {{ topicArn: string, queueUrl: string }}
 */
exports.createTopic = async function createTopic(topicAndQueueName) {
  const queueData = await exports.createSQSQueue(topicAndQueueName);
  const queueUrl = exports.normaliseQueueUrl(queueData.QueueUrl);

  const topicData = await sns
    .createTopic({
      Name: topicAndQueueName
    })
    .promise();

  const topicArn = topicData.TopicArn;

  // Retrieve the actual SQS queue ARN so the subscription works for both real AWS and localstack
  const queueAttrs = await sqs
    .getQueueAttributes({
      QueueUrl: queueUrl,
      AttributeNames: ['QueueArn']
    })
    .promise();

  const queueArn = queueAttrs.Attributes.QueueArn;

  // Set an SQS policy that allows the SNS topic to send messages to the queue
  await sqs
    .setQueueAttributes({
      QueueUrl: queueUrl,
      Attributes: { Policy: getPolicy(topicArn, queueArn) }
    })
    .promise();

  await sns
    .subscribe({
      TopicArn: topicArn,
      Protocol: 'sqs',
      Endpoint: queueArn,
      Attributes: {
        RawMessageDelivery: 'true'
      }
    })
    .promise();

  return { topicArn, queueUrl };
};
