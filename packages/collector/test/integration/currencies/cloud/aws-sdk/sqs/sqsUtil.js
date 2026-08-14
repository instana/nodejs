/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');

/**
 * Here we "hack" into AWS SDK to force the User Agent header to be an array, so we can test if our instrumentation of
 * httpClient is properly handling this case. The Node.js outgoing HTTP headers accept string, number or array of
 * strings, which is why we want to test this.
 */
const _appendToUserAgent = AWS.HttpRequest.prototype.appendToUserAgent;
AWS.HttpRequest.prototype.appendToUserAgent = function () {
  _appendToUserAgent.apply(this, arguments);
  this.headers[this.getUserAgentHeaderName()] = [this._userAgent];
};

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

AWS.config.update({ region: 'us-east-2' });
exports.getLocalstackEndpoint = getLocalstackEndpoint;
exports.getClientConfig = getClientConfig;
const sqs = new AWS.SQS(getClientConfig());

exports.sqs = sqs;

exports.purgeQueues = function (urls) {
  const promises = urls.map(
    url =>
      new Promise((resolve, reject) => {
        sqs
          .purgeQueue({
            QueueUrl: url
          })
          .promise()
          .then(data => {
            setTimeout(() => {
              resolve(data);
            }, 3000);
          })
          .catch(err => {
            if (err.code === 'AWS.SimpleQueueService.PurgeQueueInProgress') {
              resolve('Previous purge still running');
            } else {
              reject(err);
            }
          });
      })
  );

  return Promise.all(promises);
};

exports.createQueues = function (queueNames) {
  const promises = queueNames.map(name =>
    sqs
      .createQueue({
        QueueName: name
      })
      .promise()
  );

  return Promise.all(promises);
};

exports.deleteQueues = function (urls) {
  const promises = urls.map(url =>
    sqs
      .deleteQueue({
        QueueUrl: url
      })
      .promise()
      .catch(err => {
        if (err.code === 'AWS.SimpleQueueService.NonExistentQueue') {
          return Promise.resolve();
        }
        return Promise.reject(err);
      })
  );

  return Promise.all(promises);
};
