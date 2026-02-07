/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const uuid = require('uuid');
const semver = require('semver');
const awsSdk3 = require('@aws-sdk/client-sqs');
const sns = require('@aws-sdk/client-sns');
const { StandardRetryStrategy } = require('@aws-sdk/middleware-retry');

const maxAttempts = 6;

const customRetryStrategy = new StandardRetryStrategy(async () => maxAttempts, {
  retryDecider: err => {
    // eslint-disable-next-line no-console
    console.log('Not connected to LocalStack, retrying...', err.code);
    return true;
  },
  delayDecider: () => 5000
});

const sqs = new awsSdk3.SQS({
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  },
  region: 'us-east-2',
  endpoint: process.env.LOCALSTACK_AWS,
  retryStrategy: customRetryStrategy
});

const clientOpts = {
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  },
  endpoint: process.env.LOCALSTACK_AWS,
  region: 'us-east-2',
  retryStrategy: customRetryStrategy
};

const snsClient = new sns.SNSClient(clientOpts);

exports.createQueue = async name => {
  return sqs.createQueue({
    QueueName: name
  });
};

exports.createTopic = async name => {
  return snsClient.send(new sns.CreateTopicCommand({ Name: name }));
};

exports.subscribe = async (arn, queueUrl) => {
  const getQueueAttributesCommand = new awsSdk3.GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ['QueueArn']
  });

  const getQueueAttributesResponse = await sqs.send(getQueueAttributesCommand);

  await snsClient.send(
    new sns.SubscribeCommand({
      TopicArn: arn,
      Protocol: 'sqs',
      Endpoint: getQueueAttributesResponse.Attributes.QueueArn,
      Attributes: {
        RawMessageDelivery: 'true'
      }
    })
  );
};

exports.removeQueue = async url => {
  await sqs.deleteQueue({
    QueueUrl: url
  });
};

exports.generateQueueName = () => {
  let queueName = 'nodejs-team';

  if (process.env.SQS_QUEUE_NAME) {
    queueName = `${process.env.SQS_QUEUE_NAME}-v3-${semver.major(process.versions.node)}-${uuid.v4()}`;
  }

  const randomNumber = Math.floor(Math.random() * 1000);
  queueName = `${queueName}-${randomNumber}`;
  return queueName;
};
