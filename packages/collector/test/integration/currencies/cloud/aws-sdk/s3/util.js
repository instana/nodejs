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
      secretAccessKey: 'test',
      s3ForcePathStyle: true
    };
  }
  return { region: 'us-east-2' };
}

AWS.config.update({ region: 'us-east-2' });
exports.getClientConfig = getClientConfig;
const s3 = new AWS.S3(getClientConfig());

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
