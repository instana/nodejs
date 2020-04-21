/* eslint-disable consistent-return */

'use strict';

const unresponsive = process.env.UNRESPONSIVE === 'true';

exports.handler = async event => {
  console.log('invoked with', event);
  if (!event.httpMethod || !event.path || !event.body) {
    // malformed event, probably not an API gateway request
    return { statusCode: 400 };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405 };
  }

  if (event.path === '/serverless/bundle') {
    return postBundle(event);
  } else if (event.path === '/serverless/metrics') {
    return postMetrics(event);
  } else if (event.path === '/serverless/traces') {
    return postTraces(event);
  }
  return { statusCode: 404 };
};

async function postBundle(event) {
  console.log('incoming bundle');
  if (unresponsive) {
    return doNotRespond();
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return responseWithMessage(400, 'Malformed HTTP request body, please send JSON.');
  }

  if (!body.metrics) {
    return responseWithMessage(400, 'Payload has no metrics.');
  }
  if (typeof body.metrics !== 'object') {
    return responseWithMessage(400, 'The metrics value in the payload is no object.');
  }
  if (Array.isArray(body.metrics)) {
    return responseWithMessage(400, 'The metrics value in the payload is an array.');
  }
  if (!body.spans) {
    return responseWithMessage(400, 'Payload has no spans.');
  }
  if (!Array.isArray(body.spans)) {
    return responseWithMessage(400, 'The spans value in the payload is no array.');
  }
  return { statusCode: 201 };
}

async function postMetrics(event) {
  console.log('incoming metrics');
  if (unresponsive) {
    return doNotRespond();
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return responseWithMessage(400, 'Malformed HTTP request body, please send JSON.');
  }

  if (typeof body !== 'object') {
    return responseWithMessage(400, 'The payload is no object.');
  }
  if (Array.isArray(body)) {
    return responseWithMessage(400, 'The payload is an array.');
  }
  return { statusCode: 201 };
}

async function postTraces(event) {
  console.log('incoming spans');
  if (unresponsive) {
    return doNotRespond();
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return responseWithMessage(400, 'Malformed HTTP request body, please send JSON.');
  }

  if (!Array.isArray(body)) {
    return responseWithMessage(400, 'The payload is no array.');
  }
  return { statusCode: 201 };
}

function responseWithMessage(statusCode, message) {
  return responseWithPayload(statusCode, { message });
}

function responseWithPayload(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body)
  };
}

async function doNotRespond() {
  // Intentionally delaying the response until after the Lambda timeout for tests that verify proper timeout handling in
  // backend_connector.
  await new Promise(resolve => setTimeout(resolve, 4000));
  return { statusCode: 501 };
}
