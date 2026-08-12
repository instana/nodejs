/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const uuid = require('uuid');
const semver = require('semver');
const awsSdk3 = require('@aws-sdk/client-sqs');
const sns = require('@aws-sdk/client-sns');
const { getClientConfig } = require('./util');

function getLocalstackEndpoint() {
  if (process.env.RUN_AWS === 'true') return null;
  let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS;
  if (!endpoint) return null;
  if (endpoint.startsWith('localstack://')) {
    endpoint = endpoint.replace('localstack://', 'http://');
  }
  return endpoint;
}

const sqs = new awsSdk3.SQS(getClientConfig());
const snsClient = new sns.SNSClient(getClientConfig());

function normaliseQueueUrl(queueUrl) {
  const endpoint = getLocalstackEndpoint();
  if (!endpoint || !queueUrl) return queueUrl;
  const endpointUrl = new URL(endpoint);
  return queueUrl.replace(/https?:\/\/[^/]+/, `${endpointUrl.protocol}//${endpointUrl.host}`);
}

function getPolicy(topicArn, queueArn) {
  return JSON.stringify({
    Version: '2008-10-17',
    Id: '__default_policy_ID',
    Statement: [
      {
        Sid: `topic-subscription-${topicArn}`,
        Effect: 'Allow',
        Principal: { AWS: '*' },
        Action: 'SQS:SendMessage',
        Resource: queueArn,
        Condition: { ArnLike: { 'aws:SourceArn': topicArn } }
      }
    ]
  });
}

exports.normaliseQueueUrl = normaliseQueueUrl;

exports.createQueue = async name => {
  const result = await sqs.createQueue({ QueueName: name });
  return { ...result, QueueUrl: normaliseQueueUrl(result.QueueUrl) };
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

  // Set an SQS policy that allows the SNS topic to send messages to the queue
  await sqs.setQueueAttributes({
    QueueUrl: queueUrl,
    Attributes: { Policy: getPolicy(arn, queueArn) }
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
