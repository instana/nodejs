/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const AWS = require('aws-sdk');

/**
 * Reads the AWS credentials from the AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN environment
 * variables (e.g. exported by `awstoken <MFA-CODE>`).
 */
exports.getCredentials = function getCredentials() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = process.env;

  return new AWS.Credentials({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    sessionToken: AWS_SESSION_TOKEN
  });
};
