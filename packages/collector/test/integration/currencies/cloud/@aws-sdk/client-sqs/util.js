/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('@aws-sdk/client-sqs');

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
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
    };
  }
  return { region: 'us-east-2' };
}

const sqs = new AWS.SQS(getClientConfig());

exports.createQueues = function (queueNames) {
  const promises = queueNames.map(name =>
    sqs.createQueue({
      QueueName: name
    })
  );

  return Promise.all(promises);
};

exports.deleteQueues = function (urls) {
  const promises = urls.map(url =>
    sqs
      .deleteQueue({
        QueueUrl: url
      })
      .catch(err => {
        if (err.code === 'AWS.SimpleQueueService.NonExistentQueue') {
          return Promise.resolve();
        }
        return Promise.reject(err);
      })
  );

  return Promise.all(promises);
};

/*
 * Sends a message to the queue that simulates a SNS notification routed into SQS via a SNS/SQS subscription.
 */
exports.sendSnsNotificationToSqsQueue = function sendSnsNotificationToSqsQueue(queueURL, traceId, parentId) {
  const traceIdKey = 'X_InSTaNa_t';
  const parentIdKey = 'x_insTAnA_S';
  const levelKey = 'X_INSTaNa_L';
  return new Promise((resolve, reject) => {
    const sendParams = {
      MessageBody: JSON.stringify({
        Type: 'Notification',
        MessageId: '99999c55-7d4e-555b-a1ef-4532d06f474c',
        TopicArn: 'arn:aws:sns:us-east-2:555123456890:sns-topic-with-sqs-subscription',
        Subject: 'Test Message Subject',
        Message: "The SNS message's body.",
        MessageAttributes: {
          [traceIdKey]: {
            Type: 'String',
            Value: traceId
          },
          [parentIdKey]: {
            Type: 'String',
            Value: parentId
          },
          [levelKey]: {
            Type: 'String',
            Value: '1'
          }
        }
      }),
      QueueUrl: queueURL,
      MessageAttributes: {
        unrelated_attribute: {
          DataType: 'String',
          StringValue: 'some unrelated attribute'
        }
      }
    };

    sqs.sendMessage(sendParams, (err, data) => {
      if (err) {
        return reject(err);
      } else {
        return resolve({
          status: 'OK-CALLBACK-NOT-INSTRUMENTED',
          data
        });
      }
    });
  });
};
