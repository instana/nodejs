/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');

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
const kinesis = new AWS.Kinesis(getClientConfig());
const interval = 1000;
const MAX_WAIT_TIME = 10000;

exports.checkStreamExistence = function checkStreamExistence(streamName, expectsToExist = true) {
  let timer = 0;
  return new Promise(resolve => {
    const intervalId = setInterval(() => {
      timer += interval;
      if (timer >= MAX_WAIT_TIME) {
        resolve(`Timeout after ${timer} ms`);
        clearInterval(intervalId);
      }

      const p = kinesis.describeStream({ StreamName: streamName }).promise();

      p.then(data => {
        if (expectsToExist && data && data.StreamDescription && data.StreamDescription.StreamStatus === 'ACTIVE') {
          resolve(data);
          clearInterval(intervalId);
        }
      }).catch(() => {
        if (!expectsToExist) {
          resolve(`Stream ${streamName} does not exist as expected`);
          clearInterval(intervalId);
        }
      });
    }, interval);
  });
};

/**
 * Attempts to delete a previous created stream before the test starts
 * @param {string} streamName
 */
exports.cleanup = async function (streamName) {
  try {
    await kinesis
      .deleteStream({
        StreamName: streamName
      })
      .promise();
    return exports.checkStreamExistence(streamName, false);
  } catch (err) {
    return Promise.resolve('Stream did not exist');
  }
};
