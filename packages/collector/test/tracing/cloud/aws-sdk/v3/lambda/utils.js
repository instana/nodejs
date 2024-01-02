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
const { isCI } = require('@instana/core/test/test_util');
/**
 *  Local stack is disabled if running in CI environment.
 *  Lambda invocation is currently not running on CircleCI requires additional configuration
 *  to handle Lambda functions within LocalStack. This involves setting up a volume mount, which may not be
 *  supported with the current Docker executor options in circleci.
 *  GH issues: https://discuss.localstack.cloud
 *  /t/lambda-is-currently-not-working-on-circleci-for-my-current-docker-configurations/535
 *  For more detailed information about CircleCI and LocalStack integration, please refer to the official documentation:
 *  CircleCI LocalStack Orb Executors. https://circleci.com/developer/orbs/orb/localstack/platform
 *  TODO: Implement support for running Lambda function tests on LocalStack with CircleCI.
 */
exports.isLocalStackDisabled = function () {
  return isCI();
};

exports.getClientConfig = function () {
  if (exports.isLocalStackDisabled()) {
    return {
      region: 'us-east-2'
    };
  } else {
    return {
      endpoint: process.env.LOCALSTACK_AWS,
      region: 'us-east-2'
    };
  }
};
const clientOpts = this.getClientConfig();
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
    }, 1000);
  });
};

async function isFunctionCreationComplete(functionName) {
  const data = await lambdaClient.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
  return data.State === 'Active';
}

exports.removeFunction = async functionName => {
  try {
    const deleteFunctionParams = {
      FunctionName: functionName
    };
    await lambdaClient.send(new DeleteFunctionCommand(deleteFunctionParams));
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      // eslint-disable-next-line no-console
      console.log(`Lambda function not found: ${functionName}`);
    }
  }
};
