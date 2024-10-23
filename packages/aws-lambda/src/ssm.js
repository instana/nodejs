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

module.exports.init = ({ logger }) => {
  // CASE: INSTANA_SSM_PARAM_NAME is not set by the customer, skip initialization
  if (!exports.isUsed()) {
    return;
  }

  // CASE: The SSM parameter value has already been fetched, skip further fetching
  if (fetchedValue) {
    return;
  }

  initTimeoutInMs = Date.now();

  try {
    let SSMClient;
    let GetParameterCommand;

    /**
     * As per AWS Lambda Node.js documentation:
     *
     * The environment includes the AWS SDK for JavaScript, with credentials from an IAM role that you manage.
     */
    // eslint-disable-next-line import/no-extraneous-dependencies, instana/no-unsafe-require, prefer-const
    ({ SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm'));

    const params = {
      Name: envValue,
      /**
       * For more details, see:
       * https://docs.aws.amazon.com/cli/latest/reference/ssm/get-parameter.html#options
       * The parameter in the store is either a "string" or a "SecureString".
       * A "SecureString" uses a KMS key for encryption/decryption.
       */
      WithDecryption: process.env[ENV_DECRYPTION] === 'true'
    };

    logger.debug(`INSTANA_SSM_PARAM_NAME is ${process.env.INSTANA_SSM_PARAM_NAME}.`);
    const client = new SSMClient({ region: process.env.AWS_REGION });
    const command = new GetParameterCommand(params);

    client
      .send(command)
      .then(response => {
        // CASE: The parameter is of type SecureString, but decryption wasn't specified
        if (response.Parameter.Type === 'SecureString' && process.env[ENV_DECRYPTION] !== 'true') {
          errorFromAWS = 'The SSM parameter is a SecureString. Please set INSTANA_SSM_DECRYPTION=true.';
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
    logger.warn('AWS SDK is not available.');
    errorFromAWS =
      `Unable to fetch the Instana key from the SSM Parameter Store using "${process.env.INSTANA_SSM_PARAM_NAME}",` +
      ` as the AWS SDK is unavailable. Reason: ${err.message}`;
  }
};

module.exports.waitAndGetInstanaKey = callback => {
  // CASE: The SSM parameter value has already been fetched, skip the wait
  if (fetchedValue) {
    return callback(null, fetchedValue);
  }
  // CASE: INSTANA_SSM_PARAM_NAME was set, but AWS response could not be fetched
  if (errorFromAWS) {
    return callback(errorFromAWS);
  }

  const endInMs = Date.now();
  const awsTimeoutInMs = process.env.INSTANA_AWS_SSM_TIMEOUT_IN_MS
    ? Number(process.env.INSTANA_AWS_SSM_TIMEOUT_IN_MS)
    : 2000;

  // CASE: The time between SSM initialization and waitAndGetInstanaKey is too long to wait for the AWS response
  if (endInMs - initTimeoutInMs > awsTimeoutInMs) {
    return callback(`Stopped waiting for AWS SSM response after ${awsTimeoutInMs}ms.`);
  }

  /**
   * Typically, the `GetParameterCommand` call within AWS takes around 300-500ms.
   * Since the fetching is initiated before the customer's handler is invoked,
   * the likelihood of needing this interval is low.
   *
   * In tests, the remote call generally takes ~500ms.
   */
  let stopIntervalAfterMs = 500;
  let ssmTimeOutEnv = process.env.INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS;

  if (ssmTimeOutEnv && ssmTimeOutEnv.length > 0) {
    ssmTimeOutEnv = Number(ssmTimeOutEnv);

    // NOTE: The customer might set a timeout greater than the Lambda timeout
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
