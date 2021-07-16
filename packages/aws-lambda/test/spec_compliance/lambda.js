/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable import/order */

'use strict';

const instana = require('../..');

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../src/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..');

const fetch = require('node-fetch');

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;

exports.handler = instana.wrap(async () => {
  const downstreamResponse = await fetch(downstreamDummyUrl);
  const downstreamResponseBody = await downstreamResponse.json();
  return {
    statusCode: 200,
    body: downstreamResponseBody
  };
});
