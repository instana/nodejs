/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const AWS = require('aws-sdk');
const AdmZip = require('adm-zip');
const {
  getLocalstackEndpoint,
  getClientConfig
} = require('@_local/collector/test/integration/currencies/cloud/aws-sdk/aws-utils');

AWS.config.update({ region: 'us-east-2' });
exports.getLocalstackEndpoint = getLocalstackEndpoint;
exports.getClientConfig = getClientConfig;

const lambda = new AWS.Lambda(getClientConfig());

const lambdaFunctionCode = `
  exports.handler = async (event) => {
    const response = {
      statusCode: 200,
      body: JSON.stringify({ message: 'Hello, Lambda!' }),
    };
    return response;
  };
`;

exports.createFunction = async function (functionName) {
  const zip = new AdmZip();
  zip.addFile('index.js', Buffer.from(lambdaFunctionCode));
  const zipBuffer = zip.toBuffer();

  await lambda
    .createFunction({
      FunctionName: functionName,
      Runtime: 'nodejs18.x',
      Role: 'arn:aws:iam::012345678901:role/lambda-role',
      Handler: 'index.handler',
      Code: { ZipFile: zipBuffer }
    })
    .promise();

  return new Promise(resolve => {
    const intervalId = setInterval(async () => {
      try {
        const data = await lambda.getFunctionConfiguration({ FunctionName: functionName }).promise();
        if (data.State === 'Active') {
          clearInterval(intervalId);
          resolve(true);
        }
      } catch (err) {
        clearInterval(intervalId);
        resolve(false);
      }
    }, 1000);
  });
};

exports.removeFunction = async function (functionName) {
  try {
    await lambda.deleteFunction({ FunctionName: functionName }).promise();
  } catch (err) {
    if (err.code !== 'ResourceNotFoundException') {
      throw err;
    }
  }
};
