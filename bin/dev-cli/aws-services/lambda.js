/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const AWS = require('aws-sdk');
const CLIENT_OPTIONS = { maxRetries: 1, httpOptions: { connectTimeout: 5000, timeout: 20000 } };

const CREATE_EVENT_NAME = 'CreateFunction20150331';

exports.label = 'Lambda function';

exports.list = async function list(credentials, region, { prefix, callerArn }) {
  const lambda = new AWS.Lambda({ credentials, region, ...CLIENT_OPTIONS });
  let functions = [];

  let marker;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await lambda.listFunctions({ Marker: marker }).promise();
    functions.push(...page.Functions);
    marker = page.NextMarker;
  } while (marker);

  if (prefix) {
    functions = functions.filter(fn => fn.FunctionName.startsWith(prefix));
  }
  // Only ask CloudTrail (heavily rate limited) in regions that actually have functions.
  if (functions.length > 0) {
    const createdByMe = await getFunctionNamesCreatedBy(credentials, region, callerArn);
    functions = functions.filter(fn => createdByMe.has(fn.FunctionName));
  }
  return functions.map(fn => ({ id: fn.FunctionName, details: fn.Runtime || fn.PackageType }));
};

exports.remove = async function remove(credentials, region, resource) {
  const lambda = new AWS.Lambda({ credentials, region });
  await lambda.deleteFunction({ FunctionName: resource.id }).promise();
};

/**
 * Lambda does not record who created a function, so we look at the CloudTrail CreateFunction events of the last
 * 90 days and keep those that were issued by the given caller.
 */
async function getFunctionNamesCreatedBy(credentials, region, callerArn) {
  const cloudTrail = new AWS.CloudTrail({ credentials, region, ...CLIENT_OPTIONS, maxRetries: 5 });
  const names = new Set();
  let nextToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await cloudTrail
      .lookupEvents({
        LookupAttributes: [{ AttributeKey: 'EventName', AttributeValue: CREATE_EVENT_NAME }],
        NextToken: nextToken
      })
      .promise();
    page.Events.forEach(event => {
      const detail = JSON.parse(event.CloudTrailEvent);
      const requestedName = detail.requestParameters && detail.requestParameters.functionName;
      if (detail.errorCode || !requestedName || !detail.userIdentity || detail.userIdentity.arn !== callerArn) {
        return;
      }
      names.add(requestedName.split(':function:').pop().split(':')[0]);
    });
    nextToken = page.NextToken;
  } while (nextToken);
  return names;
}
