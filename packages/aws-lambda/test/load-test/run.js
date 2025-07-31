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
const filterTimedOuts = process.env.FILTER_TIMED_OUTS ? Boolean(process.env.FILTER_TIMED_OUTS) : false;
const avoidColdStart = process.env.AVOID_COLD_START ? Boolean(process.env.AVOID_COLD_START) : false;
let functionName = released ? 'teamnodejstracer-released-many-spans' : 'teamnodejstracer-many-spans';

if (process.env.FUNCTION_NAME) {
  functionName = process.env.FUNCTION_NAME;
}

const cloudWatchLogsClient = new CloudWatchLogsClient({ region });

async function getFunctionUrl() {
  const result = execSync(`aws lambda get-function-url-config --function-name ${functionName} --region ${region}`);
  const functionUrl = JSON.parse(result).FunctionUrl;
  return functionUrl;
}

const requests = process.env.REQUESTS ? parseInt(process.env.REQUESTS, 10) : 10;
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
  let timeoutErrorFound = false;
  let requestIdStart = false;
  let requestIdEnd = false;

  for (const obj of logStreamsResponse.logStreams) {
    const logStreamName = obj.logStreamName;
    // console.log(`Log Stream Name: ${logStreamName}`);

    const getLogEventsCommand = new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      limit: 1000
    });

    const logEventsResponse = await cloudWatchLogsClient.send(getLogEventsCommand);

    for (const event of logEventsResponse.events) {
      if (filterTimedOuts) {
        if (requestIdStart && !requestIdEnd) {
          if (event.message.includes('request failed')) {
            timeoutErrorFound = true;
          }
        }
      }

      if (event.message.includes(requestId)) {
        requestIdStart = true;
        const match = event.message.match(/Billed Duration: (\d+) ms/);
        if (match) {
          billedDuration = parseInt(match[1], 10);
        }
      } else if (requestIdStart) {
        requestIdEnd = true;
      }
    }
  }

  if (filterTimedOuts) {
    if (timeoutErrorFound) {
      return billedDuration;
    }

    return null;
  }

  if (billedDuration) {
    return billedDuration;
  }

  throw new Error(`No billed duration found for RequestId: ${requestId}`);
}

async function loadTest() {
  const functionUrl = await getFunctionUrl();
  const logGroupName = `/aws/lambda/${functionName}`;
  const requestIds = {};

  console.log(`Function Name: ${functionName}`);
  console.log(`Function URL: ${functionUrl}`);

  if (filterTimedOuts) {
    console.log('Filtering requests by timed out.');
  }

  console.log(`Executing ${requests}...`);
  let response;

  if (avoidColdStart) {
    response = await fetch(functionUrl);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  for (let i = 1; i <= requests; i++) {
    const start = process.hrtime.bigint();

    response = await fetch(functionUrl);
    const requestId = response.headers.get('x-amzn-requestid');

    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    requestIds[requestId] = { durationMs };

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`Executed ${requests}...`);

  console.log('Fetching billed duration...');
  await new Promise(resolve => setTimeout(resolve, 1000 * 200));

  const billedDurations = [];
  for (const id of Object.keys(requestIds)) {
    try {
      const billedDuration = await getBilledDurationByRequestId(logGroupName, id);

      if (!billedDuration) {
        delete requestIds[id];
        continue;
      }

      console.log(`${id} HTTP Response Time: ${requestIds[id].durationMs}ms`);
      console.log(`${id} Billed: ${billedDuration}ms`);
      billedDurations.push(billedDuration);
    } catch (error) {
      console.error(`Failed to get billed duration for Request ${id}:`, error.message);
    }
  }

  if (Object.keys(requestIds).length === 0) {
    console.error('No results.');
    return;
  }

  console.log(`Total Requests: ${Object.keys(requestIds).length}`);

  // log the average response time for all requests responseTimes
  const averageResponseTime =
    Object.values(requestIds).reduce((a, b) => a + b.durationMs, 0) / Object.keys(requestIds).length;
  console.log(`Average Response Time: ${averageResponseTime.toFixed(3)}ms`);

  // log the average billed duration for all requests billedDurations
  const averageBilledDuration = billedDurations.reduce((a, b) => a + b, 0) / billedDurations.length;
  console.log(`Average Billed Duration: ${averageBilledDuration.toFixed(3)}ms`);
}

loadTest().catch(error => {
  console.error('Error during load test:', error);
});
