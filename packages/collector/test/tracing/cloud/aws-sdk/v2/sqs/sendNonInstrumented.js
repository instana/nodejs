/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { sqs } = require('./sqsUtil');

/*
 * Sends out a message directly to the SQS queue with a given trace ID and parent ID.
 */
exports.sendMessageWithLegacyHeaders = function sendMessageWithLegacyHeaders(queueURL, traceId, parentId) {
  return new Promise((resolve, reject) => {
    const sendParams = {
      MessageBody: 'message sent via callback function',
      QueueUrl: queueURL,
      MessageAttributes: {
        X_INSTANA_ST: {
          DataType: 'String',
          StringValue: traceId
        },
        X_INSTANA_SS: {
          DataType: 'String',
          StringValue: parentId
        },
        X_INSTANA_SL: {
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
