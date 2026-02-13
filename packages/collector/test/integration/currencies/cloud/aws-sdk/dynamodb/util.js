/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-2' });
const dynamoDB = new AWS.DynamoDB();
const interval = 1000;
const MAX_WAIT_TIME = 10000;

exports.checkTableExistence = function checkTableExistence(tableName, expectsToExist = true) {
  let timer = 0;
  return new Promise(resolve => {
    const intervalId = setInterval(() => {
      timer += interval;
      if (timer >= MAX_WAIT_TIME) {
        resolve(`Timeout after ${timer} ms`);
        clearInterval(intervalId);
      }

      const p = dynamoDB.describeTable({ TableName: tableName }).promise();

      p.then(data => {
        if (expectsToExist && data && data.Table && data.Table.TableStatus === 'ACTIVE') {
          resolve(data);
          clearInterval(intervalId);
        }
      }).catch(() => {
        if (!expectsToExist) {
          resolve(`Table ${tableName} does not exist as expected`);
          clearInterval(intervalId);
        }
      });
    }, interval);
  });
};

/**
 * Attempts to delete a previous created table before the test starts
 * @param {string} tableName
 */
exports.cleanup = async function (tableName) {
  try {
    await dynamoDB
      .deleteTable({
        TableName: tableName
      })
      .promise();
    return exports.checkTableExistence(tableName, false);
  } catch (err) {
    return Promise.resolve('Table did not exist');
  }
};
