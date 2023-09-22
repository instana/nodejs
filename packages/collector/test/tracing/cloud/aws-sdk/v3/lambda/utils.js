/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const {
  LambdaClient,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand
} = require('@aws-sdk/client-lambda');
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
  await lambdaClient.send(new CreateFunctionCommand(createFunctionParams));

  return new Promise(resolve => {
    const intervalId = setInterval(async () => {
      try {
        const isCreationComplete = await isFunctionCreationComplete(functionName);
        if (isCreationComplete) {
          clearInterval(intervalId);
          resolve(true);
        }
      } catch (error) {
        clearInterval(intervalId);
        resolve(false);
      }
    }, 3000);
  });
};

async function isFunctionCreationComplete(functionName) {
  const data = await lambdaClient.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
  return data.State === 'Active';
}

exports.removeFunction = async functionName => {
  const deleteFunctionParams = {
    FunctionName: functionName
  };
  await lambdaClient.send(new DeleteFunctionCommand(deleteFunctionParams));
};
