/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { KinesisClient, DescribeStreamCommand, DeleteStreamCommand } = require('@aws-sdk/client-kinesis');
const { isCI } = require('@_local/core/test/test_util');

exports.isLocalStackDisabled = function () {
  return isCI();
};

exports.getClientConfig = function () {
  if (exports.isLocalStackDisabled()) {
    return {
      region: 'us-east-2'
    };
  } else {
    // Convert localstack:// protocol to http:// for AWS SDK compatibility
    let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS || 'http://localhost:4566';
    if (endpoint.startsWith('localstack://')) {
      endpoint = endpoint.replace('localstack://', 'http://');
    }

    return {
      endpoint: endpoint,
      region: 'us-east-2',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    };
  }
};

const kinesis = new KinesisClient(exports.getClientConfig());
const interval = 1000;
const MAX_WAIT_TIME = 10000;

exports.checkStreamExistence = function checkStreamExistence(streamName, expectsToExist = true) {
  let timer = 0;
  return new Promise(resolve => {
    const intervalId = setInterval(async () => {
      timer += interval;
      if (timer >= MAX_WAIT_TIME) {
        resolve(`Timeout after ${timer} ms`);
        clearInterval(intervalId);
      }
      const command = new DescribeStreamCommand({ StreamName: streamName });

      const p = await kinesis.send(command);
      p.then(data => {
        if (
          expectsToExist &&
          data &&
          data.StreamDescriptionSummary &&
          data.StreamDescriptionSummary.StreamStatus === 'ACTIVE'
        ) {
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
 * Attempts to delete a previously created stream before the test starts
 * @param {string} streamName
 */
exports.cleanup = async function (streamName) {
  try {
    const command = new DeleteStreamCommand({ StreamName: streamName });
    await kinesis.send(command);
    return exports.checkStreamExistence(streamName, false);
  } catch (err) {
    return Promise.resolve('Stream did not exist');
  }
};
