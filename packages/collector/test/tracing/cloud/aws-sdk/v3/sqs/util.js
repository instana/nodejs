/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('@aws-sdk/client-sqs');
const sqs = new AWS.SQS({ region: 'us-east-2' });

exports.createQueues = function (queueNames) {
  const promises = queueNames.map(name => {
    return sqs.createQueue({
      QueueName: name
    });
  });

  return Promise.all(promises);
};

exports.deleteQueues = function (urls) {
  const promises = urls.map(url => {
    return sqs
      .deleteQueue({
        QueueUrl: url
      })
      .catch(err => {
        if (err.code === 'AWS.SimpleQueueService.NonExistentQueue') {
          return Promise.resolve();
        }
        return Promise.reject(err);
      });
  });

  return Promise.all(promises);
};
