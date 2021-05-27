/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-2' });
const kinesis = new AWS.Kinesis();
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
