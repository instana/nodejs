/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const awsChinaRegion = process.env.AWS_CHINA_REGION;
const awsChinaAccessKeyId = process.env.AWS_CHINA_ACCESS_KEY_ID;
const awsChinaSecretAccessKey = process.env.AWS_CHINA_SECRET_ACCESS_KEY;
const awsChinaFunctionName = process.env.AWS_CHINA_FUNCTION_NAME;
const awsChinaLambdaInvocationIsConfigured =
  awsChinaRegion != null && awsChinaAccessKeyId != null && awsChinaSecretAccessKey != null && awsChinaFunctionName;

// eslint-disable-next-line import/no-extraneous-dependencies
const AWS = require('aws-sdk');

const awsLambdaClientsPerRegion = {};
let awsLambdaClientForChineseMainRegion;

let regions = [];

// Note: We do not use lru-cache for the lru feature but for how it handles max-age: "Items are not pro-actively pruned
// out as they age, but if you try to get an item that is too old, it'll drop it and return undefined instead of giving
// it to you."
// That means there is no scheduled code that needs to run regularly for removing old cached versions, which makes the
// package a good fit for caching in an AWS Lambda.
const versionsCache = new (require('lru-cache'))({ maxAge: 1000 * 60 * 15 });

const lambdaRunningInAwsChina = isThisLambdaRunningInAwsChina();

exports.handler = async event => {
  if (!event.httpMethod || !event.path) {
    // malformed event, probably not an API gateway request
    return { statusCode: 400, headers: corsAllowAll() };
  }

  const lookup = {
    '/nodejs': '/instana-nodejs',
    '/java': '/instana-java',
    '/python': '/instana-python'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsAllowAll() };
  } else if (event.path === '/') {
    return handleRootRequest(event);
  } else {
    const layerName = lookup[event.path] || event.path;
    return handleLayerRequest(event, layerName.replace(/\//g, ''));
  }
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
      'instana-nodejs-arm64': `${baseUrl}/instana-nodejs-arm64`,
      'instana-python': `${baseUrl}/instana-python`
    })
  };
}

async function handleLayerRequest(event, layerName) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsAllowAll() };
  }

  let region = event.queryStringParameters ? event.queryStringParameters.region : null;
  region = region || process.env.DEFAULT_REGION || 'us-east-2';
  if (!(await isValidRegion(region))) {
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
  let result;
  if (!lambdaRunningInAwsChina && isChineseRegion(region)) {
    // Chinese regions do not appear in the list returned by getAWSRegions() but we can delegate the request to the
    // instance of this Lambda running in AWS China. On the other hand, if this _is_ the instance of the Lambda function
    // running in China, it can use a normal listLayerVersions call to respond to the request.
    if (!awsChinaLambdaInvocationIsConfigured) {
      throw new Error(
        // eslint-disable-next-line max-len
        `The requested region ${region} seems to be a Chinese AWS region, but the credentials and settings for accessing the AWS Lambda in China are not set, so the request cannot be delegated to the Chinese Instana layer version Lambda function.`
      );
    }
    result = await delegateRequestToAwsChina(region, layerName);
  } else {
    result = await invokeListLayerVersionsAndProcessResult(region, layerName);
  }

  if (layerName.includes('instana-nodejs') && typeof result.description === 'string') {
    const npmVersionMatch = result.description.match(/@instana\/aws-lambda@(\d+\.\d+\.\d+)/);
    if (npmVersionMatch && npmVersionMatch[1]) {
      result.npmVersion = npmVersionMatch[1];
    }
  }
  const responsePayload = JSON.stringify(result);
  versionsCache.set(cacheKey, responsePayload);
  return {
    statusCode: 200,
    headers: corsAllowAll(),
    body: responsePayload
  };
}

function respond(message, statusCode) {
  return {
    statusCode: statusCode || 404,
    headers: corsAllowAll(),
    body: JSON.stringify({ message })
  };
}

/**
 * Fetch the available regions once and cache them for future requests.
 * */
async function getAWSRegions() {
  if (regions.length > 0) {
    return;
  }
  const ec2 = new AWS.EC2();
  const data = await ec2.describeRegions().promise();
  regions = data.Regions.map(r => r.RegionName);
}

async function invokeListLayerVersionsAndProcessResult(region, layerName) {
  const data = await listLayerVersions(region, layerName);
  if (!data) {
    return respond('No result from AWS ListLayerVersion operation.', 500);
  }

  if (!data.LayerVersions || !data.LayerVersions[0] || !data.LayerVersions[0].Version) {
    if (Array.isArray(data.LayerVersions) && data.LayerVersions.length === 0) {
      return respond('No layer version found.', 404);
    } else {
      return respond('Unexpected result from AWS ListLayerVersion operation.', 500);
    }
  }
  const versionData = data.LayerVersions[0];
  return {
    name: layerName,
    version: versionData.Version,
    arn: versionData.LayerVersionArn,
    description: versionData.Description
  };
}

async function listLayerVersions(region, layerName) {
  if (!awsLambdaClientsPerRegion[region]) {
    awsLambdaClientsPerRegion[region] = new AWS.Lambda({ region });
  }

  try {
    return await awsLambdaClientsPerRegion[region]
      .listLayerVersions({
        LayerName: layerName
      })
      .promise();
  } catch (err) {
    console.error(err, err.stack);
    return null;
  }
}

async function delegateRequestToAwsChina(region, layerName) {
  if (!lambdaRunningInAwsChina && isChineseRegion(region)) {
    // Chinese regions do not appear in the list returned by getAWSRegions() but we can delegate the request to the
    // instance of this Lambda running in AWS China. On the other hand, if this is the instance of the Lambda function
    // running in China, it can use a normal listLayerVersions call to respond to the request.
    if (!awsChinaLambdaInvocationIsConfigured) {
      throw new Error(
        // eslint-disable-next-line max-len
        `The requested region ${region} seems to be a Chinese AWS region, but the credentials and settings for accessing the AWS Lambda in China are not set, so the request cannot be delegated to the Chinese Instana layer version Lambda function.`
      );
    }

    // Ideally we would just delegate the incoming request via HTTP to an API gateway, deployed in a Chinese region
    // like cn-northwest-1, sitting in front of another instance of this Lambda function, also deployed there. Thing is,
    // you cannot simply use an API gateway in a Chinese AWS region. You would need to get an IPC exception or IPC
    // approval/license (see https://en.wikipedia.org/wiki/ICP_license). So, instead of doing that we invoke that other
    // Lambda via a direct AWS Lambda invocation. This requires credentials, but not an IPC exception/approval.

    if (!awsLambdaClientForChineseMainRegion) {
      awsLambdaClientForChineseMainRegion = new AWS.Lambda({
        region: awsChinaRegion,
        accessKeyId: awsChinaAccessKeyId,
        secretAccessKey: awsChinaSecretAccessKey
      });
    }
    const request = awsLambdaClientForChineseMainRegion.invoke({
      FunctionName: awsChinaFunctionName,
      // We need to simulate an API gateway request via a direct Lambda invocation.
      Payload: JSON.stringify({
        httpMethod: 'GET',
        path: `/${layerName}`,
        queryStringParameters: {
          region
        }
      }),
      LogType: 'None'
    });
    const result = await request.promise();
    if (!result || !result.Payload) {
      throw new Error('Unexpected result from AWS Lambda Invoke operation.');
    }
    try {
      const parsedPayload = JSON.parse(result.Payload);
      parsedPayload.body = JSON.parse(parsedPayload.body);
      if (!parsedPayload || !parsedPayload.body) {
        throw new Error('Unexpected result from AWS Lambda Invoke operation.');
      }
      return parsedPayload.body;
    } catch (e) {
      throw new Error('Unexpected result from AWS Lambda Invoke operation.');
    }
  }
}

async function isValidRegion(region) {
  await getAWSRegions();
  if (regions.includes(region)) {
    return true;
  }
  if (!lambdaRunningInAwsChina) {
    // Chinese regions do not appear in the list returned by getAWSRegions() but we can delegate the request to the
    // instance of this Lambda running in AWS China later on, so we recognize all Chinese regions as valid here.
    return isChineseRegion(region);
  }
  return false;
}

function isThisLambdaRunningInAwsChina() {
  const currentRegion = process.env.AWS_REGION;
  if (currentRegion == null) {
    throw new Error(
      // eslint-disable-next-line max-len
      'The layer-version-api needs to know in which region it is running, but the environment variable AWS_REGION is not set.'
    );
  }
  return isChineseRegion(currentRegion);
}

function isChineseRegion(region) {
  return region.startsWith('cn-');
}

function corsAllowAll() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Timing-Allow-Origin': '*'
  };
}
