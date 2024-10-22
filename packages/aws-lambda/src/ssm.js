/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const ENV_NAME = 'INSTANA_SSM_PARAM_NAME';
const ENV_DECRYPTION = 'INSTANA_SSM_DECRYPTION';
let fetchedValue = null;
let envValue = null;
let errorFromAWS = null;
let initTimeoutInMs = 0;

module.exports.reset = () => {
  fetchedValue = null;
  envValue = null;
  errorFromAWS = null;
  initTimeoutInMs = 0;
};

module.exports.isUsed = () => !!envValue;
module.exports.getValue = () => envValue;

module.exports.validate = () => {
  const _envValue = process.env[ENV_NAME];

  if (!_envValue || !_envValue.length) {
    return false;
  }

  envValue = _envValue;
  return true;
};

module.exports.init = async ({ logger }) => {
  // CASE: Customer did not set INSTANA_SSM_PARAM_NAME, skip
  if (!exports.isUsed()) {
    return;
  }

  // CASE: We already fetched the SSM value, skip
  if (fetchedValue) {
    return;
  }

  initTimeoutInMs = Date.now();

  try {
    let SSMClient;
    let GetParameterCommand;
    /**
     * From https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html:
     *
     * Your code runs in an environment that includes the AWS SDK for JavaScript,
     * with credentials from an AWS Identity and Access Management (IAM) role that you manage.
     */
    // eslint-disable-next-line import/no-extraneous-dependencies, instana/no-unsafe-require, prefer-const
    ({ SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm'));
    const params = {
      Name: envValue,
      /**
       * See https://docs.aws.amazon.com/cli/latest/reference/ssm/get-parameter.html#options
       * The value in the parameter store was either created with type "string" or "safestring"
       * A "safestring" uses a KMS key to encrypt/decrypt the value in the store.
       */
      WithDecryption: process.env[ENV_DECRYPTION] === 'true'
    };

    logger.debug(`INSTANA_SSM_PARAM_NAME is ${process.env.INSTANA_SSM_PARAM_NAME}.`);
    const client = new SSMClient({ region: process.env.AWS_REGION });
    const command = new GetParameterCommand(params);

    return client
      .send(command)
      .then(response => {
        // CASE: Customer created key with decryption KMS key, but does not tell us
        if (response.Parameter.Type === 'SecureString' && process.env[ENV_DECRYPTION] !== 'true') {
          errorFromAWS = 'SSM Key is a SecureString. Please pass INSTANA_SSM_DECRYPTION=true';
        } else {
          fetchedValue = response.Parameter.Value;
          errorFromAWS = null;
          logger.debug(`INSTANA AGENT KEY: ${fetchedValue}`);
        }
      })
      .catch(error => {
        errorFromAWS = `Could not read returned response from AWS-SDK SSM Parameter Store: ${error.message}`;
      });
  } catch (err) {
    logger.warn('AWS SDK not available.');
    errorFromAWS =
      'Could not fetch instana key from SSM parameter store using ' +
      `"${process.env.INSTANA_SSM_PARAM_NAME}", because the AWS SDK is not available. ` +
      `Reason: ${err.message}`;
  }
};

module.exports.waitAndGetInstanaKey = callback => {
  // CASE: We already fetched the SSM value, skip & save time
  if (fetchedValue) {
    return callback(null, fetchedValue);
  }
  // CASE: Customer has set INSTANA_SSM_PARAM_NAME, but we were not able to fetch the value from AWS
  if (errorFromAWS) {
    return callback(errorFromAWS);
  }

  const endInMs = Date.now();
  const awsTimeoutInMs = process.env.INSTANA_AWS_SSM_TIMEOUT_IN_MS ? Number(process.env.INSTANA_AWS_SSM_TIMEOUT) : 1000;

  // CASE: the time between ssm lib initialisation and waitAndGetInstanaKey call
  //       (which is the end of the customers lambda handler) is already too big to wait for the AWS response
  if (endInMs - initTimeoutInMs > awsTimeoutInMs) {
    return callback(`Stopped waiting for AWS SSM response after ${awsTimeoutInMs}ms.`);
  }

  /**
   * Inside AWS the call to `getParameter` mostly takes 30-50ms
   * Because we initialise the fetch already before the customer's handler is called,
   * the chance is very high that the interval is not even used.
   *
   * In our tests it takes usually ~>150ms (remote call)
   */
  let stopIntervalAfterMs = 250;
  let ssmTimeOutEnv = process.env.INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS;

  if (ssmTimeOutEnv && ssmTimeOutEnv.length > 0) {
    ssmTimeOutEnv = Number(ssmTimeOutEnv);

    // NOTE: Customer could set the timeout higher than the lambda timeout, but that is up to him
    if (!isNaN(ssmTimeOutEnv)) {
      stopIntervalAfterMs = ssmTimeOutEnv;
    }
  }

  const start = Date.now();

  const waiting = setInterval(() => {
    const end = Date.now();

    if (fetchedValue) {
      clearInterval(waiting);

      callback(null, fetchedValue);
    } else if (end - start > stopIntervalAfterMs) {
      clearInterval(waiting);

      callback(
        `Could not fetch instana key from SSM parameter store using "${process.env.INSTANA_SSM_PARAM_NAME}"` +
          ', because we have not received a response from AWS.'
      );
    }
  }, 25);

  return waiting;
};
