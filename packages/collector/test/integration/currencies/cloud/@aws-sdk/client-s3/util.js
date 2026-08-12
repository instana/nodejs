/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const awsSdk3 = require('@aws-sdk/client-s3');

function getLocalstackEndpoint() {
  if (process.env.RUN_AWS === 'true') return null;
  let endpoint = process.env.INSTANA_CONNECT_LOCALSTACK_AWS;
  if (!endpoint) return null;
  if (endpoint.startsWith('localstack://')) {
    endpoint = endpoint.replace('localstack://', 'http://');
  }
  return endpoint;
}

exports.getClientConfig = function () {
  const endpoint = getLocalstackEndpoint();
  if (endpoint) {
    return {
      region: 'us-east-2',
      endpoint,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      },
      forcePathStyle: true
    };
  }
  return { region: 'us-east-2' };
};

const s3 = new awsSdk3.S3(exports.getClientConfig());

/**
 * Attempts to delete a previous created bucket before the test starts
 * @param {string} bucketName
 */
exports.cleanup = async function (bucketName) {
  try {
    await s3.deleteBucket({
      Bucket: bucketName
    });
    return Promise.resolve('Bucket deleted');
  } catch (err) {
    return Promise.resolve('Bucket did not exist');
  }
};
