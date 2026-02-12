/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable no-console */

'use strict';

/**
 * This little tool exists to send some made-up infra monitoring data about a Lambda to an Instana back end.
 */

/* configuration */
const backendHost = process.env.INSTANA_HOST || 'localhost';
const backendPort = process.env.INSTANA_PORT || 8989;
const backendTimeout = 5000;
// eslint-disable-next-line no-unneeded-ternary
const sendUnencrypted = process.env.INSTANA_DEV_SEND_UNENCRYPTED === 'false' ? false : true;
const disableCaCheck = false;

const instanaKeyEnvVar = 'INSTANA_AGENT_KEY';
const instanaKey = process.env[instanaKeyEnvVar];

if (instanaKey == null) {
  console.error('An agent key needs to be provided via INSTANA_AGENT_KEY.');
  process.exit(1);
}

/* dependencies */
const https = sendUnencrypted ? require('http') : require('https');
const constants = require('@_local/serverless/src/constants');

const legacySensorMode = process.env.LEGACY_SENSOR != null;
const anotherLambda = process.env.ANOTHER != null;
const onlyLatest = process.env.ONLY_LATEST;
// We are using a single function, 'nodejs-tracer-lambda', for our Lambda testing since we invoke an existing function.
// Our tests focus on invoking function and retrieving details of the function, rather than creating new ones.
// We originally created this function specifically for testing and are now using it across all test cases.
const name = process.env.LAMBDA_FUNCTION_NAME || 'nodejs-tracer-lambda';
const unqualifiedArn = anotherLambda
  ? `arn:aws:lambda:us-east-2:521808193417:function:${name}`
  : `arn:aws:lambda:us-east-2:767398002385:function:${name}`;

function random(maxValue) {
  return Math.floor(Math.random() * (maxValue + 1));
}

function sendPayload(callback) {
  let version = '$LATEST';
  if (process.env.LAMBDA_VERSION) {
    // send data about a fixed version
    version = process.env.LAMBDA_VERSION;
  } else if (!onlyLatest && !legacySensorMode && random(5) > 3) {
    // send data about other versions (versions 1, 2, 3) sometimes (at randoml)
    version = (1 + random(4)).toString();
  }

  const qualifiedArn = `${unqualifiedArn}:${version}`;

  const metricsData = {
    aws_grouping_zone: 'us-east-2',
    name,
    arn: legacySensorMode ? unqualifiedArn : qualifiedArn,
    runtime: 'nodejs18.x',
    handler: 'index.handler',
    timeout: 3,
    memory_size: 128,
    last_modified: '2019-08-28T07:24:32.123+0000',
    iterator_age_maximum: 0,
    duration_sum: 0,
    errors: random(5),
    unreserved_concurrent_executions: random(3),
    duration: random(1000),
    throttles: 0,
    iterator_age: random(10),
    concurrent_executions_sum: random(5),
    iterator_age_minimum: 0,
    duration_minimum: 0,
    dead_letter_error: 0,
    invocations: random(100),
    iterator_age_sum: 0,
    duration_maximum: 0,
    tags: {
      much: 'wow',
      very: 'tagged'
    },
    env_vars: {
      // NOTE: customer can set this env variable in each lambda. Sensor reads them
      INSTANA_ZONE: process.env.INSTANA_ZONE
    }
  };

  if (!legacySensorMode) {
    metricsData.version = version;
    metricsData.npmPackageName = 'wrapped-async-lambda';
    metricsData.npmPackageVersion = '1.0.0';
    metricsData.npmPackageDescription = 'An AWS Lambda';
  }

  console.log(`sending: ${JSON.stringify(metricsData, null, 2)}`);

  const metricsPayload = {
    plugins: [{ name: 'com.instana.plugin.aws.lambda', entityId: qualifiedArn, data: metricsData }]
  };

  const payload = JSON.stringify(metricsPayload);

  const options = {
    hostname: backendHost,
    port: backendPort,
    path: '/metrics',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      [constants.xInstanaHost]: 'some-random-host-that-runs-the-aws-agent',
      [constants.xInstanaKey]: instanaKey
    },
    rejectUnauthorized: !disableCaCheck
  };

  const req = https.request(options, res => {
    const unexpectedStatus = res.statusCode < 200 || res.statusCode >= 300;
    let data = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      // Ignore response data unless we received an HTTP status code indicating a problem.
      if (unexpectedStatus) {
        data += chunk;
      }
    });
    res.on('end', () => {
      if (unexpectedStatus) {
        return callback(
          new Error(
            `Received an unexpected HTTP status (${res.statusCode}) from the Instana back end. Message: ${data}`
          )
        );
      }
      return callback();
    });
  });
  req.setTimeout(backendTimeout, () => {
    callback(new Error(`The Instana back end did not respond in the configured timeout of ${backendTimeout} ms.`));
  });

  req.on('error', e => {
    callback(e);
  });

  req.write(payload);
  req.end();
}

sendPayload(e => {
  if (e) {
    console.error('Failed 😭', e);
    process.exit(1);
  } else {
    console.log('Done 🎉');
    process.exit(0);
  }
});
