/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');

function getLocalstackEndpoint() {
  let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS;
  if (endpoint) {
    if (endpoint.startsWith('localstack://')) {
      endpoint = endpoint.replace('localstack://', 'http://');
    }
    return endpoint;
  }
  return null;
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

/**
 * Normalises a queue URL returned by localstack (which uses the cloud hostname
 * sqs.<region>.localhost.localstack.cloud:<port>) to the plain localhost URL that
 * matches the configured endpoint, so AWS SDK v2 routes the request correctly.
 */
function normaliseQueueUrl(queueUrl) {
  const endpoint = getLocalstackEndpoint();
  if (!endpoint || !queueUrl) return queueUrl;
  const endpointUrl = new URL(endpoint);
  return queueUrl.replace(/https?:\/\/[^/]+/, `${endpointUrl.protocol}//${endpointUrl.host}`);
}

exports.normaliseQueueUrl = normaliseQueueUrl;

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

AWS.config.update({ region: 'us-east-2' });
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

exports.createQueues = async function (queueNames) {
  const results = await Promise.all(
    queueNames.map(name =>
      sqs
        .createQueue({
          QueueName: name
        })
        .promise()
    )
  );
  // Return a map of { name -> QueueUrl } so callers can use the actual URL
  // returned by the service (important for localstack which uses a different base URL).
  const urlMap = {};
  queueNames.forEach((name, i) => {
    urlMap[name] = normaliseQueueUrl(results[i].QueueUrl);
  });
  return urlMap;
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
