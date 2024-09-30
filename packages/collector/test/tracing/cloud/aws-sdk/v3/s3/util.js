/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const semver = require('semver');

const minNodeJsVersion = '18.0.0';

if (semver.lt(process.versions.node, minNodeJsVersion)) {
  exports.cleanup = async function () {
    throw new Error(`Requires Node.js >= ${minNodeJsVersion} but this is ${process.versions.node}.`);
  };
} else {
  const awsSdk3 = require('@aws-sdk/client-s3');
  const s3 = new awsSdk3.S3({ region: 'us-east-2' });

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
}
