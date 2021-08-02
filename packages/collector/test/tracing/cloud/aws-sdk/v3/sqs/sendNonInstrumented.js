/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const aws = require('@aws-sdk/client-sqs');
const sqs = new aws.SQS({ region: 'us-east-2' });

/*
 * Sends out a message directly to the SQS queue with a given trace ID and parent ID.
 */
exports.sendMessageWithLegacyHeaders = function sendMessageWithLegacyHeaders(queueURL, traceId, parentId) {
  return new Promise((resolve, reject) => {
    const sendParams = {
      MessageBody: 'message sent via callback function',
      QueueUrl: queueURL,
      MessageAttributes: {
        X_InSTaNa_St: {
          DataType: 'String',
          StringValue: traceId
        },
        x_insTAnA_sS: {
          DataType: 'String',
          StringValue: parentId
        },
        X_INSTaNa_SL: {
          DataType: 'String',
          StringValue: '1'
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

/*
 * Sends a message to the queue that simulates a SNS notification routed into SQS via a SNS/SQS subscription.
 */
exports.sendSnsNotificationToSqsQueue = function sendSnsNotificationToSqsQueue(
  queueURL,
  traceId,
  parentId,
  legacyAttributeNames
) {
  const traceIdKey = legacyAttributeNames ? 'X_InSTaNa_St' : 'X_InSTaNa_t';
  const parentIdKey = legacyAttributeNames ? 'x_insTAnA_sS' : 'x_insTAnA_S';
  const levelKey = legacyAttributeNames ? 'X_INSTaNa_SL' : 'X_INSTaNa_L';
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
