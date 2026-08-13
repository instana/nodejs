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
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      },
      endpoint,
      region: 'us-east-2',
      retryStrategy: customRetryStrategy
    };
  }
  return { region: 'us-east-2' };
}

exports.getLocalstackEndpoint = getLocalstackEndpoint;

const accountId = getLocalstackEndpoint() ? '000000000000' : '767398002385';
exports.accountId = accountId;

const sqs = new awsSdk3.SQS(getClientConfig());
const snsClient = new sns.SNSClient(getClientConfig());

function getSqsPolicy(queueArn, topicArn) {
  return JSON.stringify({
    Version: '2008-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: '*' },
        Action: 'SQS:SendMessage',
        Resource: queueArn,
        Condition: {
          ArnLike: { 'aws:SourceArn': topicArn }
        }
      }
    ]
  });
}

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
  const queueArn = getQueueAttributesResponse.Attributes.QueueArn;

  // Real AWS requires an explicit queue policy allowing SNS to deliver messages.
  // LocalStack does not enforce this, but we set it unconditionally for correctness.
  await sqs.setQueueAttributes({
    QueueUrl: queueUrl,
    Attributes: {
      Policy: getSqsPolicy(queueArn, arn)
    }
  });

  await snsClient.send(
    new sns.SubscribeCommand({
      TopicArn: arn,
      Protocol: 'sqs',
      Endpoint: queueArn,
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

exports.removeTopic = async arn => {
  await snsClient.send(new sns.DeleteTopicCommand({ TopicArn: arn }));
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
