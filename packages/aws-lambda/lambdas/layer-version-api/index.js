/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const AWS = require('aws-sdk');

const awsLambdaClientForRegion = {};

const VALID_REGIONS = [
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ca-central-1',
  'eu-central-1',
  'eu-north-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2'
];

// Note: We do not use lru-cache for the lru feature but for how it handles max-age: "Items are not pro-actively pruned
// out as they age, but if you try to get an item that is too old, it'll drop it and return undefined instead of giving
// it to you."
// That means there is no scheduled code that needs to run regularly for removing old cached versions, which makes the
// package a good fit for caching in an AWS Lambda.
const versionsCache = new (require('lru-cache'))({ maxAge: 1000 * 60 * 15 });

exports.handler = async event => {
  if (!event.httpMethod || !event.path) {
    // malformed event, probably not an API gateway request
    return { statusCode: 400, headers: corsAllowAll() };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsAllowAll() };
  } else if (event.path === '/') {
    return handleRootRequest(event);
  } else if (event.path === '/java' || event.path === '/instana-java') {
    return handleLayerRequest(event, 'instana-java');
  } else if (event.path === '/nodejs' || event.path === '/instana-nodejs') {
    return handleLayerRequest(event, 'instana-nodejs');
  } else if (event.path === '/python' || event.path === '/instana-python') {
    return handleLayerRequest(event, 'instana-python');
  }
  return { statusCode: 404, headers: corsAllowAll() };
};

function handleRootRequest(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsAllowAll() };
  }
  const baseUrl = event.headers && event.headers.Host ? `http://${event.headers.Host}` : 'https://base-url';
  return {
    statusCode: 200,
    headers: corsAllowAll(),
    body: JSON.stringify({
      'instana-java': `${baseUrl}/instana-java`,
      'instana-nodejs': `${baseUrl}/instana-nodejs`,
      'instana-python': `${baseUrl}/instana-python`
    })
  };
}

async function handleLayerRequest(event, layerName) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsAllowAll() };
  }

  let region = event.queryStringParameters ? event.queryStringParameters.region : null;
  region = region || 'us-east-2';
  if (!VALID_REGIONS.includes(region)) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: `Unknown region: ${region}` }),
      headers: corsAllowAll()
    };
  }

  const cacheKey = `${region}:${layerName}`;

  // According to the docs, versionsCache.get will update the "recently used"-ness but that has nothing to do with the
  // maxAge logic of lru-cache, only with the lru aspect (which we do not use).
  if (versionsCache.has(cacheKey)) {
    console.log(`Using cached result for ${cacheKey}.`);
    return {
      statusCode: 200,
      headers: corsAllowAll(),
      body: versionsCache.get(cacheKey)
    };
  }

  console.log(`No cached result for ${cacheKey}.`);
  const data = await listLayerVersions(region, layerName);
  if (!data) {
    return respond500('No result from AWS ListLayerVersion operation.');
  }
  if (!data.LayerVersions || !data.LayerVersions[0] || !data.LayerVersions[0].Version) {
    return respond500('Unexpected result from AWS ListLayerVersion operation.');
  }
  const result = JSON.stringify({
    name: layerName,
    version: data.LayerVersions[0].Version,
    arn: data.LayerVersions[0].LayerVersionArn
  });
  versionsCache.set(cacheKey, result);
  return {
    statusCode: 200,
    headers: corsAllowAll(),
    body: result
  };
}

function respond500(message) {
  return {
    statusCode: 500,
    headers: corsAllowAll(),
    body: JSON.stringify({ message })
  };
}

async function listLayerVersions(region, layerName) {
  if (!awsLambdaClientForRegion[region]) {
    awsLambdaClientForRegion[region] = new AWS.Lambda({ region });
  }

  try {
    return await awsLambdaClientForRegion[region]
      .listLayerVersions({
        LayerName: layerName
      })
      .promise();
  } catch (err) {
    console.error(err, err.stack);
    return null;
  }
}

function corsAllowAll() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Timing-Allow-Origin': '*'
  };
}
