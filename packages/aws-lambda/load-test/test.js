/*
 * (c) Copyright IBM Corp. 2024
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */

const { execSync } = require('child_process');

const region = process.env.REGION || 'us-east-1';
const released = process.env.RELEASED ? Boolean(process.env.RELEASED) : false;
const functionName = released ? 'teamnodejstracer-released-many-spans' : 'teamnodejstracer-many-spans';

async function getFunctionUrl() {
  const result = execSync(`aws lambda get-function-url-config --function-name ${functionName} --region ${region}`);
  const functionUrl = JSON.parse(result).FunctionUrl;
  return functionUrl;
}

async function loadTest() {
  const functionUrl = await getFunctionUrl();

  console.log(`Function Name: ${functionName}`);
  console.log(`Function URL: ${functionUrl}`);
  console.log('Starting...');

  // Avoid cold start
  await fetch(functionUrl);
  await new Promise(resolve => setTimeout(resolve, 2000));
  await fetch(functionUrl);
  await new Promise(resolve => setTimeout(resolve, 2000));

  for (let i = 1; i <= 10; i++) {
    const start = process.hrtime.bigint();

    await fetch(functionUrl);

    const end = process.hrtime.bigint();

    const durationMs = Number(end - start) / 1e6;
    console.log(`Request ${i}: ${durationMs.toFixed(3)}ms`);

    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

loadTest().catch(error => {
  console.error('Error during load test:', error);
});
