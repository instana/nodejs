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

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;

exports.handler = instana.wrap(async event => {
  let downstreamUrl = downstreamDummyUrl;
  if (event.queryStringParameters) {
    downstreamUrl = `${downstreamUrl}?${Object.keys(event.queryStringParameters)
      .map(key => `${key}=${event.queryStringParameters[key]}`)
      .join('&')}`;
  }
  const downstreamResponse = await fetch(downstreamUrl, {
    headers: {
      'X-Request-Header-App-To-Downstream': 'Value 2'
    }
  });
  const downstreamResponseBody = await downstreamResponse.json();
  return {
    statusCode: 200,
    body: downstreamResponseBody,
    headers: {
      'X-Response-Header-App-To-Test': 'Value 4'
    }
  };
});
