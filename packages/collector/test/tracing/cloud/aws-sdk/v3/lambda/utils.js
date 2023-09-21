/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { LambdaClient, CreateFunctionCommand, DeleteFunctionCommand } = require('@aws-sdk/client-lambda');
const AdmZip = require('adm-zip');
const clientOpts = {
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  },
  endpoint: process.env.LOCALSTACK_AWS,
  region: 'us-east-2'
};
const lambdaClient = new LambdaClient(clientOpts);
const zip = new AdmZip();
const lambdaFunctionCode = `
  exports.handler = async (event) => {
    const response = {
      statusCode: 200,
      body: JSON.stringify({ message: 'Hello, Lambda!' }),
    };
    return response;
  };
`;
exports.createFunction = async functionName => {
  zip.addFile('index.js', Buffer.from(lambdaFunctionCode));
  const zipBuffer = zip.toBuffer();
  const createFunctionParams = {
    FunctionName: functionName,
    Runtime: 'nodejs18.x',
    Role: 'arn:aws:iam::012345678901:role/lambda-role',
    Handler: 'index.handler',
    Code: {
      ZipFile: zipBuffer
    }
  };
  return lambdaClient.send(new CreateFunctionCommand(createFunctionParams));
};

exports.removeFunction = async functionName => {
  const deleteFunctionParams = {
    FunctionName: functionName
  };
  await lambdaClient.send(new DeleteFunctionCommand(deleteFunctionParams));
};
