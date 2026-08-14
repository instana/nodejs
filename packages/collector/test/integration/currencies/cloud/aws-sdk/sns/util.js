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

const accountId = getLocalstackEndpoint() ? '000000000000' : '767398002385';
exports.getLocalstackEndpoint = getLocalstackEndpoint;
exports.getClientConfig = getClientConfig;
exports.accountId = accountId;

AWS.config.update({ region: 'us-east-2' });
const sns = new AWS.SNS(getClientConfig());
const sqs = new AWS.SQS(getClientConfig());

function getPolicy(topicName, queueName) {
  const policy = {
    Version: '2008-10-17',
    Id: '__default_policy_ID',
    Statement: [
      {
        Sid: `topic-subscription-arn:aws:sns:us-east-2:${accountId}:${topicName}`,
        Effect: 'Allow',
        Principal: {
          AWS: '*'
        },
        Action: 'SQS:SendMessage',
        Resource: `arn:aws:sqs:us-east-2:${accountId}:${queueName}`,
        Condition: {
          ArnLike: {
            'aws:SourceArn': `arn:aws:sns:us-east-2:${accountId}:${topicName}`
          }
        }
      }
    ]
  };

  return JSON.stringify(policy);
}

exports.createSQSQueue = function createSQSQueue(queueName, topicName) {
  return sqs
    .createQueue({
      QueueName: queueName,
      Attributes: {
        Policy: getPolicy(topicName, queueName)
      }
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
 */
exports.createTopic = async function createTopic(topicAndQueueName) {
  await exports.createSQSQueue(topicAndQueueName, topicAndQueueName);
  const topicData = await sns
    .createTopic({
      Name: topicAndQueueName
    })
    .promise();

  await sns
    .subscribe({
      TopicArn: topicData.TopicArn,
      Protocol: 'sqs',
      Endpoint: `arn:aws:sqs:us-east-2:${accountId}:${topicAndQueueName}`,
      Attributes: {
        RawMessageDelivery: 'true'
      }
    })
    .promise();
};
