/*
 * (c) Copyright IBM Corp. 2024
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
// eslint-disable instana/no-unsafe-require

const { execSync } = require('child_process');
const {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  GetLogEventsCommand
} = require('@aws-sdk/client-cloudwatch-logs');

const region = process.env.REGION || 'us-east-1';
const released = process.env.RELEASED ? Boolean(process.env.RELEASED) : false;
const functionName = released ? 'teamnodejstracer-released-many-spans' : 'teamnodejstracer-many-spans';
const cloudWatchLogsClient = new CloudWatchLogsClient({ region });

async function getFunctionUrl() {
  const result = execSync(`aws lambda get-function-url-config --function-name ${functionName} --region ${region}`);
  const functionUrl = JSON.parse(result).FunctionUrl;
  return functionUrl;
}

const requests = 2;
let logStreamsResponse;

async function getBilledDurationByRequestId(logGroupName, requestId) {
  // Fetch the most recent log stream
  const describeLogStreamsCommand = new DescribeLogStreamsCommand({
    logGroupName,
    orderBy: 'LastEventTime',
    descending: true,
    limit: 2
  });

  if (!logStreamsResponse) {
    logStreamsResponse = await cloudWatchLogsClient.send(describeLogStreamsCommand);
  }

  if (!logStreamsResponse.logStreams || logStreamsResponse.logStreams.length === 0) {
    throw new Error('No log streams found for the Lambda function.');
  }

  let billedDuration;
  for (const obj of logStreamsResponse.logStreams) {
    const logStreamName = obj.logStreamName;
    console.log(`Log Stream Name: ${logStreamName}`);

    const getLogEventsCommand = new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      limit: 1000
    });

    const logEventsResponse = await cloudWatchLogsClient.send(getLogEventsCommand);

    for (const event of logEventsResponse.events) {
      if (event.message.includes(requestId)) {
        const match = event.message.match(/Billed Duration: (\d+) ms/);
        if (match) {
          billedDuration = parseInt(match[1], 10);
        }
      }
    }
  }

  if (billedDuration) {
    return billedDuration;
  }

  throw new Error(`No billed duration found for RequestId: ${requestId}`);
}

async function loadTest() {
  const functionUrl = await getFunctionUrl();
  const logGroupName = `/aws/lambda/${functionName}`;
  const requestIds = [];
  const responseTimes = [];

  console.log(`Function Name: ${functionName}`);
  console.log(`Function URL: ${functionUrl}`);
  console.log('Starting...');

  // Avoid cold start
  let response = await fetch(functionUrl);
  await new Promise(resolve => setTimeout(resolve, 1000));

  for (let i = 1; i <= requests; i++) {
    const start = process.hrtime.bigint();

    response = await fetch(functionUrl);
    const requestId = response.headers.get('x-amzn-requestid');
    requestIds.push(requestId);

    const end = process.hrtime.bigint();

    const durationMs = Number(end - start) / 1e6;
    console.log(`${requestId} http response: ${durationMs.toFixed(3)}ms`);

    responseTimes.push(durationMs);

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // log the average response time for all requests responseTimes
  const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  console.log(`Average Response Time: ${averageResponseTime.toFixed(3)}ms`);

  console.log(`Fetching billed duration for ${requestIds.length} requests...`);
  await new Promise(resolve => setTimeout(resolve, 1000 * 120));

  const billedDurations = [];
  for (const id of requestIds) {
    try {
      const billedDuration = await getBilledDurationByRequestId(logGroupName, id);
      console.log(`${id} Billed: ${billedDuration}ms`);
      billedDurations.push(billedDuration);
    } catch (error) {
      console.error(`Failed to get billed duration for Request ${id}:`, error.message);
    }
  }

  // log the average billed duration for all requests billedDurations
  const averageBilledDuration = billedDurations.reduce((a, b) => a + b, 0) / billedDurations.length;
  console.log(`Average Billed Duration: ${averageBilledDuration.toFixed(3)}ms`);
}

loadTest().catch(error => {
  console.error('Error during load test:', error);
});
