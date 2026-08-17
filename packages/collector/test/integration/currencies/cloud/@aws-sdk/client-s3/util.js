/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const awsSdk3 = require('@aws-sdk/client-s3');
const {
  getLocalstackEndpoint,
  getClientConfig: getSharedClientConfig
} = require('@_local/collector/test/integration/currencies/cloud/@aws-sdk/aws-utils');

exports.getLocalstackEndpoint = getLocalstackEndpoint;

exports.getClientConfig = function () {
  return getSharedClientConfig({ forcePathStyle: true });
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
