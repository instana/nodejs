/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-2' });
const sns = new AWS.SNS();
const sqs = new AWS.SQS();

function getPolicy(topicName, queueName) {
  const policy = {
    Version: '2008-10-17',
    Id: '__default_policy_ID',
    Statement: [
      {
        Sid: `topic-subscription-arn:aws:sns:us-east-2:767398002385:${topicName}`,
        Effect: 'Allow',
        Principal: {
          AWS: '*'
        },
        Action: 'SQS:SendMessage',
        Resource: `arn:aws:sqs:us-east-2:767398002385:${queueName}`,
        Condition: {
          ArnLike: {
            'aws:SourceArn': `arn:aws:sns:us-east-2:767398002385:${topicName}`
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
 */
exports.cleanup = async function (topicArn, queueURL) {
  try {
    await sns
      .deleteTopic({
        TopicArn: topicArn
      })
      .promise();

    await sqs
      .deleteQueue({
        QueueUrl: queueURL
      })
      .promise();
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
      Endpoint: `arn:aws:sqs:us-east-2:767398002385:${topicAndQueueName}`,
      Attributes: {
        RawMessageDelivery: 'true'
      }
    })
    .promise();
};
