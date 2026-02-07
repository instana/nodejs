/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-2' });
const s3 = new AWS.S3();

/**
 * Attempts to delete a previous created bucket before the test starts
 * @param {string} bucketName
 */
exports.cleanup = async function (bucketName) {
  try {
    await s3
      .deleteBucket({
        Bucket: bucketName
      })
      .promise();
    return Promise.resolve('Bucket deleted');
  } catch (err) {
    return Promise.resolve('Bucket did not exist');
  }
};
