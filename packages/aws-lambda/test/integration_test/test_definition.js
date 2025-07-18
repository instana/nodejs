/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const portfinder = require('@instana/collector/test/test_util/portfinder');
const retry = require('@instana/core/test/test_util/retry');

const config = require('@instana/core/test/config');
const delay = require('../../../core/test/test_util/delay');
const expectExactlyOneMatching = require('../../../core/test/test_util/expectExactlyOneMatching');

const { fail } = expect;

const awsRegion = 'us-east-2';
const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:${awsRegion}:767398002385:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;

const instanaAgentKey = 'aws-lambda-dummy-key';

// To improve distribution of tests to multiple executors on CI, the actual variants of this integration tests
// (according to the type of Lambda API that is used) are split into separate files (async_test.js, callback_test.js,
// etc.). These are the files that are run by mocha and that can be distributed to different executors. To avoid
// excessive duplication of test code, the test files all import and use this test definition file.

/**
 * reduced: we do not want to run the full test suite for callback type etc.
 */
module.exports = function (lambdaType, reduced = false) {
  this.timeout(config.getTestTimeout() * 4);
  return registerTests.bind(this)(path.join(__dirname, '..', 'lambdas', lambdaType), reduced);
};

function prelude(opts) {
  const env = {
    INSTANA_EXTRA_HTTP_HEADERS:
      'x-request-header-1; X-REQUEST-HEADER-2 ; x-response-header-1;X-RESPONSE-HEADER-2 , x-downstream-header  ',
    AWS_REGION: awsRegion,
    INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS: '1000',
    ...opts.env
  };
  if (opts.error) {
    env.LAMDBA_ERROR = opts.error;
  }
  if (opts.alias) {
    env.LAMBDA_FUNCTION_ALIAS = opts.alias;
  }
  if (opts.instanaEndpointUrlMissing) {
    env.INSTANA_ENDPOINT_URL = '';
  }
  if (opts.instanaTracingDisabled) {
    env.INSTANA_TRACING_DISABLE = 'true';
  }
  if (opts.instanaAgentKey) {
    env.INSTANA_AGENT_KEY = opts.instanaAgentKey;
  }
  if (opts.instanaAgentKeyViaSSM) {
    env.INSTANA_SSM_PARAM_NAME = opts.instanaAgentKeyViaSSM;
  }
  if (opts.instanaSSMDecryption) {
    env.INSTANA_SSM_DECRYPTION = opts.instanaSSMDecryption;
  }
  // INSTANA_KEY/instanaKey is deprecated and will be removed before GA - use INSTANA_AGENT_KEY/instanaAgentKey
  if (opts.instanaKey) {
    env.INSTANA_KEY = opts.instanaKey;
  }
  if (opts.proxyUrl) {
    env.INSTANA_ENDPOINT_PROXY = opts.proxyUrl;
  }
  if (opts.withConfig) {
    env.WITH_CONFIG = 'true';
  }
  if (opts.trigger) {
    env.LAMBDA_TRIGGER = opts.trigger;
  }
  if (opts.statusCode) {
    env.HTTP_STATUS_CODE = opts.statusCode;
  }
  if (opts.traceId) {
    env.INSTANA_HEADER_T = opts.traceId;
  }
  if (opts.spanId) {
    env.INSTANA_HEADER_S = opts.spanId;
  }
  if (opts.traceLevel) {
    env.INSTANA_HEADER_L = opts.traceLevel;
  }
  if (opts.traceIdContext) {
    env.INSTANA_CONTEXT_T = opts.traceIdContext;
  }
  if (opts.spanIdContext) {
    env.INSTANA_CONTEXT_S = opts.spanIdContext;
  }
  if (opts.traceLevelContext) {
    env.INSTANA_CONTEXT_L = opts.traceLevelContext;
  }
  if (opts.fillContext) {
    env.FILL_CONTEXT = 'true';
  }
  if (opts.serverTiming) {
    env.SERVER_TIMING_HEADER = opts.serverTiming;
  }
  // The option useExtension controls whether the Lambda under test should try to talk to the extension or to the back
  // end directly.
  if (opts.useExtension) {
    if (opts.lowMemory) {
      env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '128';
    } else {
      // minimum memory so that the Lambda extension is used
      env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '256';
    }
  } else {
    env.INSTANA_DISABLE_LAMBDA_EXTENSION = 'true';
  }
  if (opts.handlerDelay) {
    env.HANDLER_DELAY = opts.handlerDelay;
  }

  return env;
}

const describeOrSkipIfReduced = reduced => {
  if (!reduced) return describe;
  return Math.random() < 0.3 ? describe : describe.skip;
};

function registerTests(handlerDefinitionPath, reduced) {
  describeOrSkipIfReduced(reduced)('when everything is peachy', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - INSTANA_AGENT_KEY is configured
    // - back end is reachable
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });
    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });
    after(async () => {
      await control.stop();
    });

    it('must run the handler two times', async () => {
      return control
        .runHandler()
        .then(() => {
          return verifyAfterRunningHandler(control, {
            error: false,
            expectMetrics: true,
            expectSpans: true,
            expectColdStart: true
          });
        })
        .then(() => {
          return control.resetBackendSpansAndMetrics();
        })
        .then(() => {
          return control.reset();
        })
        .then(() => {
          return control.runHandler();
        })
        .then(() => {
          return verifyAfterRunningHandler(control, {
            error: false,
            expectMetrics: true,
            expectSpans: true,
            expectColdStart: false
          });
        });
    });
  });

  describeOrSkipIfReduced(reduced)('when called with alias', function () {
    // - function is called with alias
    // - INSTANA_ENDPOINT_URL is configured
    // - INSTANA_AGENT_KEY is configured
    // - back end is reachable
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      alias: 'anAlias',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and spans', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true, alias: 'anAlias' });
    });
  });

  describeOrSkipIfReduced(reduced)('when INSTANA_SSM_PARAM_NAME is used', function () {
    describeOrSkipIfReduced(reduced)('but we cannot fetch the key from AWS', () => {
      // - INSTANA_ENDPOINT_URL is configured
      // - INSTANA_AGENT_KEY is configured via SSM
      // - back end is reachable
      // - lambda function ends with success
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKeyViaSSM: '/Nodejstest/MyAgentKeyMissing'
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must not capture metrics and spans', () => {
        return verify(control, { error: false, expectMetrics: false, expectSpans: false });
      });
    });

    describeOrSkipIfReduced(reduced)('and it succeeds', () => {
      // - INSTANA_ENDPOINT_URL is configured
      // - INSTANA_AGENT_KEY is configured via SSM
      // - back end is reachable
      // - lambda function ends with success
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKeyViaSSM: '/Nodejstest/MyAgentKey'
      });

      let control;

      before(callback => {
        const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
        const ssmClient = new SSMClient({ region: awsRegion });
        const params = {
          Name: '/Nodejstest/MyAgentKey',
          Value: instanaAgentKey,
          Type: 'String',
          Overwrite: true
        };

        const createSSMKey = async () => {
          try {
            await ssmClient.send(new PutParameterCommand(params));
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log('DEBUG', error);
            throw new Error(`Cannot set SSM parameter store value: ${error.name} ${error.message}`);
          }
        };

        const run = async (retries = 0) => {
          try {
            await createSSMKey();
            callback();
          } catch (error) {
            if (retries >= 2) {
              return callback(new Error('Could not create SSM key.'));
            }
            await run(retries + 1);
          }
        };

        run();
      });

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must capture metrics and spans', () => {
        return verify(control, { error: false, expectMetrics: true, expectSpans: true });
      });
    });

    describeOrSkipIfReduced(reduced)('[with decryption] error', () => {
      const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
      const { KMSClient, CreateKeyCommand, ScheduleKeyDeletionCommand } = require('@aws-sdk/client-kms');
      let kmsKeyId;

      // - INSTANA_ENDPOINT_URL is configured
      // - INSTANA_AGENT_KEY is configured via SSM
      // - back end is reachable
      // - lambda function ends with success
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKeyViaSSM: '/Nodejstest/MyAgentKeyEncrypted'
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      after(async () => {
        const kmsClient = new KMSClient({ region: awsRegion });
        try {
          await kmsClient.send(
            new ScheduleKeyDeletionCommand({
              KeyId: kmsKeyId,
              PendingWindowInDays: 7
            })
          );
        } catch (error) {
          throw new Error(`Cannot remove KMS key: ${error.message}`);
        }
      });

      before(async () => {
        const ssmClient = new SSMClient({ region: awsRegion });
        const kmsClient = new KMSClient({ region: awsRegion });

        try {
          const kmsResponse = await kmsClient.send(new CreateKeyCommand({}));
          kmsKeyId = kmsResponse.KeyMetadata.KeyId;

          const params = {
            Name: '/Nodejstest/MyAgentKeyEncrypted',
            Value: instanaAgentKey,
            Type: 'SecureString',
            KeyId: kmsKeyId,
            Overwrite: true
          };

          const createSSMKey = async () => {
            try {
              await ssmClient.send(new PutParameterCommand(params));
            } catch (error) {
              // eslint-disable-next-line no-console
              console.log('DEBUG', error);
              throw new Error(`Cannot set SSM parameter store value: ${error.name} ${error.message}`);
            }
          };

          let retries = 0;
          const run = async () => {
            try {
              await createSSMKey();
            } catch (error) {
              if (retries > 2) {
                throw new Error('Could not create SSM key.');
              }
              retries += 1;
              await run();
            }
          };

          await run();
        } catch (kmsErr) {
          // eslint-disable-next-line no-console
          console.error(`Failed to set KMS key: ${kmsErr.message}`);
        }
      });

      it('must not capture metrics and spans', () => {
        return verify(control, { error: false, expectMetrics: false, expectSpans: false });
      });
    });

    describe('[with decryption] succeeds', () => {
      const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
      const { KMSClient, CreateKeyCommand, ScheduleKeyDeletionCommand } = require('@aws-sdk/client-kms');
      let kmsKeyId;

      // - INSTANA_ENDPOINT_URL is configured
      // - INSTANA_AGENT_KEY is configured via SSM
      // - back end is reachable
      // - lambda function ends with success
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKeyViaSSM: '/Nodejstest/MyAgentKeyEncrypted',
        instanaSSMDecryption: true
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      after(async () => {
        const kmsClient = new KMSClient({ region: awsRegion });
        try {
          await kmsClient.send(
            new ScheduleKeyDeletionCommand({
              KeyId: kmsKeyId,
              PendingWindowInDays: 7
            })
          );
        } catch (error) {
          throw new Error(`Cannot remove KMS key: ${error.message}`);
        }
      });

      before(async () => {
        const ssmClient = new SSMClient({ region: awsRegion });
        const kmsClient = new KMSClient({ region: awsRegion });

        try {
          const kmsResponse = await kmsClient.send(new CreateKeyCommand({}));
          kmsKeyId = kmsResponse.KeyMetadata.KeyId;

          const params = {
            Name: '/Nodejstest/MyAgentKeyEncrypted',
            Value: instanaAgentKey,
            Type: 'SecureString',
            KeyId: kmsKeyId,
            Overwrite: true
          };

          const createSSMKey = async () => {
            try {
              await ssmClient.send(new PutParameterCommand(params));
            } catch (error) {
              // eslint-disable-next-line no-console
              console.log('DEBUG', error);
              throw new Error(`Cannot set SSM parameter store value: ${error.name} ${error.message}`);
            }
          };

          let retries = 0;
          const run = async () => {
            try {
              await createSSMKey();
            } catch (error) {
              if (retries > 2) {
                throw new Error('Could not create SSM key.');
              }
              retries += 1;
              await run();
            }
          };

          await run();
        } catch (kmsErr) {
          // eslint-disable-next-line no-console
          console.error(`Failed to set KMS key: ${kmsErr.message}`);
        }
      });

      it('must capture metrics and spans', () => {
        return verify(control, { error: false, expectMetrics: true, expectSpans: true });
      });
    });
  });

  describeOrSkipIfReduced(reduced)('when lambda function yields an error', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - lambda function ends with an error
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      error: 'asynchronous'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and spans', () => {
      return verify(control, { error: 'lambda-asynchronous', expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('when lambda function throws a synchronous error', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - lambda function ends with an error
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      error: 'synchronous'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and spans', () => {
      return verify(control, { error: 'lambda-synchronous', expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('with config', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - client provides a config object
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      withConfig: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and spans', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('with config, when lambda function yields an error', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - client provides a config object
    // - lambda function ends with an error
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      withConfig: true,
      error: 'asynchronous'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and spans', () => {
      return verify(control, { error: 'lambda-asynchronous', expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('when INSTANA_ENDPOINT_URL is missing', function () {
    // - INSTANA_ENDPOINT_URL is missing
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrlMissing: true,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must ignore the missing URL gracefully', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)(
    'when INSTANA_ENDPOINT_URL is missing and the lambda function yields an error',
    function () {
      // - INSTANA_ENDPOINT_URL is missing
      // - lambda function ends with an error
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaEndpointUrlMissing: true,
        instanaAgentKey,
        error: 'asynchronous'
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must ignore the missing URL gracefully', () => {
        return verify(control, { error: 'lambda-asynchronous', expectMetrics: false, expectSpans: false });
      });
    }
  );

  describeOrSkipIfReduced(reduced)('with config, when INSTANA_ENDPOINT_URL is missing', function () {
    // - INSTANA_ENDPOINT_URL is missing
    // - client provides a config
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrlMissing: true,
      instanaAgentKey,
      withConfig: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must ignore the missing URL gracefully', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)('when INSTANA_AGENT_KEY is missing', function () {
    // - INSTANA_AGENT_KEY is missing
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must ignore the missing key gracefully', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)(
    'when INSTANA_AGENT_KEY is missing and the lambda function yields an error',
    function () {
      // - INSTANA_AGENT_KEY is missing
      // - lambda function ends with an error
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        error: 'asynchronous'
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must ignore the missing key gracefully', () => {
        return verify(control, { error: 'lambda-asynchronous', expectMetrics: false, expectSpans: false });
      });
    }
  );

  describeOrSkipIfReduced(reduced)('when the back end is down', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is not reachable
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: false,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must ignore the failed request gracefully', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)('when the back end is HTTPS', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is not reachable
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        backendUsesHttps: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must ignore the failed request gracefully', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('when the back end is down and the lambda function yields an error', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is not reachable
    // - lambda function ends with an error
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      error: 'asynchronous'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: false,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must ignore the failed request gracefully', () => {
      return verify(control, { error: 'lambda-asynchronous', expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)('when the back end is reachable but does not respond', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable, but will never respond (verifies that a reasonable timeout is applied -
    //   the default timeout would be two minutes)
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: 'unresponsive',
        env
      });

      await control.start();
    });

    after(async () => {
      await control.stop();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    it('must finish swiftly', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced()('when deprecated INSTANA_DISABLE_TRACING is set', function () {
    // - INSTANA_ENDPOINT_URL is missing
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      instanaTracingDisabled: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('expect no tracing data', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced()('when INSTANA_TRACING_DISABLE is set', function () {
    // - INSTANA_ENDPOINT_URL is missing
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      instanaTracingDisabled: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('expect no tracing data', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)(
    'when the back end becomes responsive again after a timeout in a previous handler run',
    function () {
      // - INSTANA_ENDPOINT_URL is configured
      // - back end will not respond for the first lambda handler run, but for the second one
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKey,
        startBackend: 'unresponsive'
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: 'unresponsive',
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('should start reporting again on next handler run', () => {
        return control
          .runHandler()
          .then(() => {
            return verifyAfterRunningHandler(control, { error: false, expectMetrics: false, expectSpans: false });
          })
          .then(() => {
            return control.resetBackendSpansAndMetrics();
          })
          .then(() => {
            return control.setResponsive(true);
          })
          .then(() => {
            return control.reset();
          })
          .then(() => {
            return control.runHandler();
          })
          .then(() => {
            return verifyAfterRunningHandler(control, { error: false, expectMetrics: true, expectSpans: true });
          });
      });
    }
  );

  describeOrSkipIfReduced(reduced)('when the extension is used and available', function () {
    // This starts the backend stub on the extension port, simulating that the Lambda extension is available. The case
    // that the Lambda extension is _not_ available is tested in "when the extension is used but not available"
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      useExtension: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        startExtension: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must deliver metrics and spans to the extension', async () => {
      await verify(control, { error: false, expectMetrics: true, expectSpans: true });

      return retry(async () => {
        // With an working and responsive Lambda extension, we expect
        // * the heartbeat request succeed, and the
        // * data being sent via the extension (instead of being sent to the back end directly).
        const spansFromExtension = await control.getSpansFromExtension();
        expect(spansFromExtension).to.have.length(2);
      });
    });
  });

  describeOrSkipIfReduced(reduced)('when the extension is used and available, but not enough memory', function () {
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      useExtension: true,
      lowMemory: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        startExtension: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('should still expect spans or metrics', async () => {
      await verify(control, { error: false, expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('when the extension is used but not available', function () {
    // In this test, backend_connector will make the heartbeat request to the Lambda extension, which will be
    // unsuccessful, then it will fall back to sending data directly to the back end.
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      useExtension: true,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        startExtension: false,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must deliver metrics and spans directly to the back end', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('when the extension is used and available, but is unresponsive', function () {
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      startExtension: 'unresponsive',
      useExtension: true,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        startExtension: 'unresponsive',
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must deliver metrics and spans directly to the back end', async () => {
      await verify(control, { error: false, expectMetrics: true, expectSpans: true });

      // With the Lambda extension being unresponsive when the heartbeat request is made, we expect
      // * the heartbeat request to the extension to time out, and the
      // * data being sent directly to the back end.

      // With an unresponsive Lambda extension, we expect the spans to be send to the back end directly. But the devil
      // is in the details: Whether the in-process collector attempts to send data to the extension first depends on the
      // timing.
      // * When the Lamba handler finishes very fast, the in-process collector will try to send data to the
      // extension _before_ the heartbeat request has returned or timed out.
      // * When the Lambda handler takes longer than the heartbeat request, the in-process collector will not even try
      //   to use the extenion but send to the back end directly.
      //
      // This is why we do not check control.getSpansFromExtension() here.
      //
      // See also the next test:
      //   "when the extension is used and available, but is unresponsive, and the handler finishes _after_
      //   the heartbeat request"
    });
  });

  describeOrSkipIfReduced(reduced)(
    'when the extension is used and available, but is unresponsive, and the handler finishes _after_ the ' +
      'heartbeat request',
    function () {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        handlerDelay: 500,
        useExtension: true,
        instanaAgentKey
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          startExtension: 'unresponsive',
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must deliver metrics and spans directly to the back end', async () => {
        await verify(control, { error: false, expectMetrics: true, expectSpans: true });

        // This is an extension to the previous test ("must deliver metrics and spans directly to the back end"). See
        // there for an explanation. In this test, we introduce an artifical delay into the Lambda handler to make sure
        // it finishes _after_ the heartbeat request. This way we can verify that the in-process collector will not
        // attempt to send data to the back end.
        await delay(500);

        const spansFromExtension = await control.getSpansFromExtension();
        expect(spansFromExtension).to.have.length(0);
      });
    }
  );

  describeOrSkipIfReduced(reduced)(
    'when the extension is used and the heartbeat request responds with an unexpected status code',
    function () {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        handlerDelay: 100,
        useExtension: true,
        instanaAgentKey
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          startExtension: 'unexpected-heartbeat-response',
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must deliver metrics and spans directly to the back end', async () => {
        await verify(control, { error: false, expectMetrics: true, expectSpans: true });

        await delay(500);

        // With the Lambda extension heartbeat request failing, we expect
        // * the heartbeat request to the extension to time out, and the
        // * data being sent directly to the back end.
        const spansFromExtension = await control.getSpansFromExtension();
        expect(spansFromExtension).to.have.length(0);
      });
    }
  );

  // eslint-disable-next-line max-len
  describeOrSkipIfReduced(reduced)(
    'when the extension is used, the heartbeat request succeeds, but the extension becomes unresponsive later',
    function () {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        useExtension: true,
        instanaAgentKey
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          startExtension: 'unresponsive-later',
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must deliver metrics and spans directly to the back end', async () => {
        await verify(control, { error: false, expectMetrics: true, expectSpans: true });

        // With the heartbeat request succeeding but the extension becoming unresponsive later, the outcome basically
        // depends on whether we store the spans in the extenion stub when it is simulating unresponsiveness or not.
        // Currently we do that, so we expect 2 spans.
        return retry(async () => {
          const spansFromExtension = await control.getSpansFromExtension();
          expect(spansFromExtension).to.have.length(2);
        });
      });
    }
  );

  describeOrSkipIfReduced(reduced)(
    'when the extension is used, but is unresponsive and BE throws ECONNREFUSED',
    function () {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        useExtension: true,
        instanaAgentKey
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: false,
          startExtension: 'unresponsive',
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must deliver metrics and spans to the extension', () => {
        return verify(control, { error: 'connect ECONNREFUSED', expectMetrics: false, expectSpans: false });
      });
    }
  );

  describeOrSkipIfReduced(reduced)('when using a proxy without authentication', function () {
    let control;

    before(async () => {
      const proxyPort = portfinder();

      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKey,
        proxyPort,
        proxyUrl: `http://localhost:${proxyPort}`
      });

      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        startProxy: true,
        proxyPort,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and spans', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('when using a proxy with authentication', function () {
    let control;

    before(async () => {
      const proxyPort = portfinder();

      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKey,
        proxyPort,
        proxyUrl: `http://user:password@localhost:${proxyPort}`
      });

      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        startProxy: true,
        proxyPort,
        proxyRequiresAuthorization: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and spans', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true });
    });
  });

  describeOrSkipIfReduced(reduced)('when proxy authentication fails due to the wrong password', function () {
    let control;

    before(async () => {
      const proxyPort = portfinder();

      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKey,
        proxyPort,
        proxyUrl: `http://user:wrong-password@localhost:${proxyPort}`
      });

      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        // Proxy only works with HTTPS!
        backendUsesHttps: true,
        startProxy: true,
        proxyPort,
        proxyRequiresAuthorization: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must not impact the original handler', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)(
    'when proxy authentication fails because no credentials have been provided',
    function () {
      let control;

      before(async () => {
        const proxyPort = portfinder();

        const env = prelude.bind(this)({
          handlerDefinitionPath,
          instanaAgentKey,
          proxyPort,
          proxyUrl: `http://localhost:${proxyPort}`
        });

        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          backendUsesHttps: true,
          proxyRequiresAuthorization: true,
          startProxy: true,
          proxyPort,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must not impact the original handler', () => {
        return verify(control, { error: false, expectMetrics: false, expectSpans: false });
      });
    }
  );

  describeOrSkipIfReduced(reduced)('when the proxy is not up', function () {
    let control;

    before(async () => {
      const proxyPort = portfinder();

      const env = prelude.bind(this)({
        handlerDefinitionPath,
        instanaAgentKey,
        proxyPort,
        proxyUrl: `http://localhost:${proxyPort}`
      });

      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        backendUsesHttps: true,
        startProxy: false,
        proxyPort,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must not impact the original handler', () => {
      return verify(control, { error: false, expectMetrics: false, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)('everything is peachy - triggered by API Gateway (Lambda Proxy)', function () {
    ['1.0', '2.0'].forEach(payloadFormatVersion => {
      describeOrSkipIfReduced(reduced)(`PayloadFormatVersion ${payloadFormatVersion}`, function () {
        // - same as "everything is peachy"
        // - but triggered by AWS API Gateway (with Lambda Proxy)
        const env = prelude.bind(this)({
          handlerDefinitionPath,
          trigger: 'api-gateway-proxy',
          statusCode: 200,
          instanaAgentKey
        });

        let control;

        before(async () => {
          control = new Control({
            faasRuntimePath: path.join(__dirname, '../runtime_mock'),
            handlerDefinitionPath,
            startBackend: true,
            env
          });

          await control.start();
        });

        beforeEach(async () => {
          await control.reset();
          await control.resetBackendSpansAndMetrics();
        });

        after(async () => {
          await control.stop();
        });

        it('must recognize API gateway trigger (with proxy)', () => {
          return verify(
            control,
            { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:api.gateway' },
            { payloadFormatVersion }
          )
            .then(() => {
              return control.getSpans();
            })
            .then(spans => {
              if (payloadFormatVersion === '1.0') {
                expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('aws.lambda.entry'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.data.http).to.be.an('object'),
                  span => expect(span.data.http.method).to.equal('POST'),
                  span => expect(span.data.http.url).to.equal('/path/to/path-xxx/path-yyy'),
                  span => expect(span.data.http.path_tpl).to.equal('/path/to/{param1}/{param2}'),
                  span =>
                    expect(span.data.http.params).to.equal(
                      'param1=param-value&param1=another-param-value&param2=param-value'
                    ),
                  span =>
                    expect(span.data.http.header).to.deep.equal({
                      'x-request-header-1': 'A Header Value',
                      'x-request-header-2': 'Multi Value,Header Value',
                      'x-response-header-1': 'response header value 1',
                      'x-response-header-2': 'response,header,value 2'
                    }),
                  span => expect(span.data.http.host).to.not.exist,
                  span => expect(span.data.http.status).to.equal(200)
                ]);
              } else {
                expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('aws.lambda.entry'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.data.http).to.be.an('object'),
                  span => expect(span.data.http.method).to.equal('POST'),
                  span => expect(span.data.http.url).to.equal('/path/to/path-xxx/path-yyy'),
                  span => expect(span.data.http.path_tpl).to.equal('/path/to/{param1}/{param2}'),
                  span =>
                    expect(span.data.http.params).to.equal('parameter1=value1&parameter1=value2&parameter2=value'),
                  span =>
                    expect(span.data.http.header).to.deep.equal({
                      'x-request-header-1': 'A Header Value 1, A Header Value 2',
                      'x-request-header-2': 'a header value single',
                      'x-response-header-1': 'response header value 1, response header value 2',
                      'x-response-header-2': 'response header value 2'
                    }),
                  span => expect(span.data.http.host).to.not.exist,
                  span => expect(span.data.http.status).to.equal(200)
                ]);
              }
            });
        });
      });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by API Gateway (Lambda Proxy) with parent span', function () {
    // - same as "everything is peachy"
    // - but triggered by AWS API Gateway (with Lambda Proxy)
    // - with an incoming parent span
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaAgentKey,
      statusCode: 201,
      traceId: '1234567890abcdef',
      spanId: 'fedcba9876543210'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize API gateway trigger (with proxy) with parent span', () => {
      return verify(control, {
        error: false,
        expectMetrics: true,
        expectSpans: true,
        trigger: 'aws:api.gateway',
        parent: {
          t: '1234567890abcdef',
          s: 'fedcba9876543210'
        }
      })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http).to.be.an('object'),
            span => expect(span.data.http.method).to.equal('POST'),
            span => expect(span.data.http.url).to.equal('/path/to/path-xxx/path-yyy'),
            span => expect(span.data.http.path_tpl).to.equal('/path/to/{param1}/{param2}'),
            span =>
              expect(span.data.http.params).to.equal(
                'param1=param-value&param1=another-param-value&param2=param-value'
              ),
            span => expect(span.data.http.host).to.not.exist,
            span => expect(span.data.http.status).to.equal(201)
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by API Gateway (Lambda Proxy) with suppression', function () {
    // - same as triggered by AWS API Gateway (with Lambda Proxy)
    // - but with an incoming trace level header to suppress tracing
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaAgentKey,
      traceLevel: '0'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must not trace when suppressed', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: false });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by API Gateway (Lambda Proxy) - HTTP errors', function () {
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaAgentKey,
      statusCode: 502
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture HTTP error codes >= 500', () => {
      return verify(control, { error: 'http', expectMetrics: true, expectSpans: true, trigger: 'aws:api.gateway' })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http).to.be.an('object'),
            span => expect(span.data.http.method).to.equal('POST'),
            span => expect(span.data.http.url).to.equal('/path/to/path-xxx/path-yyy'),
            span => expect(span.data.http.path_tpl).to.equal('/path/to/{param1}/{param2}'),
            span =>
              expect(span.data.http.params).to.equal(
                'param1=param-value&param1=another-param-value&param2=param-value'
              ),
            span => expect(span.data.http.host).to.not.exist,
            span => expect(span.data.http.status).to.equal(502)
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('API Gateway/EUM Server-Timing header', function () {
    ['1.0', '2.0'].forEach(payloadFormatVersion => {
      describeOrSkipIfReduced(reduced)(`No header present (PayloadFormat: ${payloadFormatVersion})`, function () {
        const env = prelude.bind(this)({
          handlerDefinitionPath,
          trigger: 'api-gateway-proxy',
          instanaAgentKey
        });

        let control;

        before(async () => {
          control = new Control({
            faasRuntimePath: path.join(__dirname, '../runtime_mock'),
            handlerDefinitionPath,
            startBackend: true,
            env
          });

          await control.start();
        });

        beforeEach(async () => {
          await control.reset();
          await control.resetBackendSpansAndMetrics();
        });

        after(async () => {
          await control.stop();
        });

        it('must inject the Server-Timing header', () => {
          let serverTimingValue = null;

          return verify(
            control,
            { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:api.gateway' },
            { payloadFormatVersion }
          )
            .then(() => {
              const response = control.getLambdaResults()[0];

              if (payloadFormatVersion === '1.0') {
                serverTimingValue = getHeaderCaseInsensitive(response.multiValueHeaders, 'server-timing');
              } else {
                serverTimingValue = getHeaderCaseInsensitive(response.headers, 'server-timing');
              }

              expect(serverTimingValue).to.match(/^intid;desc=[0-9a-f]+$/);
            })
            .then(() => {
              return control.getSpans();
            })
            .then(spans => {
              expectExactlyOneMatching(spans, [
                span => expect(span.n).to.equal('aws.lambda.entry'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(/^intid;desc=([0-9a-f]+)$/.exec(serverTimingValue)[1]).to.equal(span.t)
              ]);
            });
        });
      });

      describeOrSkipIfReduced(reduced)('String header already present', function () {
        const env = prelude.bind(this)({
          handlerDefinitionPath,
          trigger: 'api-gateway-proxy',
          instanaAgentKey,
          serverTiming: 'string'
        });

        let control;

        before(async () => {
          control = new Control({
            faasRuntimePath: path.join(__dirname, '../runtime_mock'),
            handlerDefinitionPath,
            startBackend: true,
            env
          });

          await control.start();
        });

        beforeEach(async () => {
          await control.reset();
          await control.resetBackendSpansAndMetrics();
        });

        after(async () => {
          await control.stop();
        });

        it('must inject the Server-Timing header', () => {
          let serverTimingValue = null;

          return verify(
            control,
            { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:api.gateway' },
            { payloadFormatVersion }
          )
            .then(() => {
              const response = control.getLambdaResults()[0];
              serverTimingValue = getHeaderCaseInsensitive(response.headers, 'server-timing');
              expect(serverTimingValue).to.match(/^cache;desc="Cache Read";dur=23.2, intid;desc=[0-9a-f]+$/);
            })
            .then(() => {
              return control.getSpans();
            })
            .then(spans => {
              expectExactlyOneMatching(spans, [
                span => expect(span.n).to.equal('aws.lambda.entry'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span =>
                  expect(
                    /^cache;desc="Cache Read";dur=23.2, intid;desc=([0-9a-f]+)$/.exec(serverTimingValue)[1]
                  ).to.equal(span.t)
              ]);
            });
        });
      });

      describeOrSkipIfReduced(reduced)(
        `Array header already present (PayloadFormat: ${payloadFormatVersion})`,
        function () {
          const env = prelude.bind(this)({
            handlerDefinitionPath,
            trigger: 'api-gateway-proxy',
            instanaAgentKey,
            serverTiming: 'array'
          });

          let control;

          before(async () => {
            control = new Control({
              faasRuntimePath: path.join(__dirname, '../runtime_mock'),
              handlerDefinitionPath,
              startBackend: true,
              env
            });

            await control.start();
          });

          beforeEach(async () => {
            await control.reset();
            await control.resetBackendSpansAndMetrics();
          });

          after(async () => {
            await control.stop();
          });

          it('must add our Server-Timing value to the first entry in the multi value header array', () => {
            let serverTimingValue = null;

            return verify(
              control,
              { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:api.gateway' },
              { payloadFormatVersion }
            )
              .then(() => {
                const response = control.getLambdaResults()[0];

                if (payloadFormatVersion === '1.0') {
                  const serverTimingValueArray = getHeaderCaseInsensitive(response.multiValueHeaders, 'server-timing');
                  expect(serverTimingValueArray).to.have.length(2);
                  expect(serverTimingValueArray[0]).to.match(
                    /^cache;desc="Cache Read";dur=23.2, intid;desc=([0-9a-f]+)$/
                  );
                  expect(serverTimingValueArray[1]).to.equal('cpu;dur=2.4');
                  serverTimingValue = serverTimingValueArray[0];
                } else {
                  const headerVal = getHeaderCaseInsensitive(response.headers, 'server-timing');
                  expect(headerVal).to.match(/^cache;desc="Cache Read";dur=23.2,cpu;dur=2.4, intid;desc=([0-9a-f]+)/);
                  serverTimingValue = headerVal;
                }
              })
              .then(() => {
                return control.getSpans();
              })
              .then(spans => {
                expectExactlyOneMatching(spans, [
                  span => expect(span.n).to.equal('aws.lambda.entry'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  // initd;desc=entrySpan.t
                  span => expect(serverTimingValue).to.contain(span.t)
                ]);
              });
          });
        }
      );
    });
  });

  describeOrSkipIfReduced(reduced)('API Gateway - with custom secrets', function () {
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaAgentKey,
      env: {
        INSTANA_SECRETS: 'equals:param1,param2'
      }
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must filter secrets from query params', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:api.gateway' })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http.params).to.equal('param1=<redacted>&param1=<redacted>&param2=<redacted>')
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('API Gateway – with invalid event path', function () {
    const invalidPathParams = [{}, 123, { path: '/api' }];

    let control;
    before(async () => {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        trigger: 'api-gateway-proxy',
        instanaAgentKey
      });

      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    invalidPathParams.forEach(param => {
      it(`should gracefully handle and parse invalid event path param: ${JSON.stringify(param)}`, async () => {
        await verify(
          control,
          {
            error: false,
            expectMetrics: true,
            expectSpans: true,
            trigger: 'aws:api.gateway'
          },
          {
            payloadFormatVersion: '2.0',
            pathParameter: param
          }
        );

        const spans = await control.getSpans();

        expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('aws.lambda.entry'),
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.data.http).to.be.an('object'),
          span => expect(span.data.http.method).to.equal('POST'),
          span => expect(span.data.http.url).to.equal(null),
          span => expect(span.data.http.path_tpl).to.equal(null),
          span => expect(span.data.http.params).to.equal('parameter1=value1&parameter1=value2&parameter2=value'),
          span =>
            expect(span.data.http.header).to.deep.equal({
              'x-request-header-1': 'A Header Value 1, A Header Value 2',
              'x-request-header-2': 'a header value single',
              'x-response-header-1': 'response header value 1, response header value 2',
              'x-response-header-2': 'response header value 2'
            }),
          span => expect(span.data.http.host).to.not.exist
        ]);
      });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by API Gateway (no Lambda Proxy)', function () {
    // - same as "everything is peachy"
    // - but triggered by AWS API Gateway (without Lambda Proxy)
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-no-proxy',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize API gateway trigger (without proxy)', () => {
      return verify(control, {
        error: false,
        expectMetrics: true,
        expectSpans: true,
        trigger: 'aws:api.gateway.noproxy'
      })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http).to.not.exist
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by an application load balancer', function () {
    // - same as "everything is peachy"
    // - but triggered by an application load balancer
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'application-load-balancer',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize the application load balancer trigger', () => {
      return verify(control, {
        error: false,
        expectMetrics: true,
        expectSpans: true,
        trigger: 'aws:application.load.balancer'
      })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http).to.be.an('object'),
            span => expect(span.data.http.method).to.equal('GET'),
            span => expect(span.data.http.url).to.equal('/path/to/resource'),
            span => expect(span.data.http.path_tpl).to.not.exist,
            span => expect(span.data.http.params).to.equal('param1=value1&param2=value2'),
            span =>
              expect(span.data.http.header).to.deep.equal({
                'x-request-header-1': 'A Header Value',
                'x-request-header-2': 'Multi Value,Header Value',
                'x-response-header-1': 'response header value 1',
                'x-response-header-2': 'response,header,value 2'
              }),
            span => expect(span.data.http.host).to.not.exist
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by an application load balancer with parent span', function () {
    // - same as "everything is peachy"
    // - but triggered by an application load balancer
    // - with an incoming parent span
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'application-load-balancer',
      instanaAgentKey,
      traceId: '1234567890abcdef',
      spanId: 'fedcba9876543210'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize the application load balancer trigger and parent span', () => {
      return verify(control, {
        error: false,
        expectMetrics: true,
        expectSpans: true,
        trigger: 'aws:application.load.balancer',
        parent: {
          t: '1234567890abcdef',
          s: 'fedcba9876543210'
        }
      })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http).to.be.an('object'),
            span => expect(span.data.http.method).to.equal('GET'),
            span => expect(span.data.http.url).to.equal('/path/to/resource'),
            span => expect(span.data.http.path_tpl).to.not.exist,
            span => expect(span.data.http.params).to.equal('param1=value1&param2=value2'),
            span => expect(span.data.http.host).to.not.exist
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)(
    'triggered by AWS SDK Lambda invoke function with parent span from an empty context',
    function () {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        trigger: 'invoke-function',
        instanaAgentKey,
        traceIdContext: '1234567890abcdef',
        spanIdContext: 'fedcba9876543210',
        traceLevelContext: '1'
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must instrument with Instana headers coming from clientContext', () => {
        return verify(control, {
          error: false,
          expectMetrics: true,
          expectSpans: true,
          trigger: 'aws:lambda.invoke',
          parent: {
            t: '1234567890abcdef',
            s: 'fedcba9876543210'
          }
        })
          .then(() => {
            return control.getSpans();
          })
          .then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('aws.lambda.entry'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http).to.not.exist
            ]);
          });
      });
    }
  );

  describeOrSkipIfReduced(reduced)(
    'triggered by AWS SDK Lambda invoke function with parent span from a non-empty context',
    function () {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        trigger: 'invoke-function',
        instanaAgentKey,
        traceIdContext: '1234567890abcdef',
        spanIdContext: 'fedcba9876543210',
        traceLevelContext: '1',
        fillContext: true
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must instrument with Instana headers coming from clientContext', () => {
        return verify(control, {
          error: false,
          expectMetrics: true,
          expectSpans: true,
          trigger: 'aws:lambda.invoke',
          parent: {
            t: '1234567890abcdef',
            s: 'fedcba9876543210'
          }
        })
          .then(() => {
            const lambdaContext = control.getClientContext();
            expect(lambdaContext && lambdaContext.Custom).to.exist;
            expect(lambdaContext && lambdaContext.Custom && lambdaContext.Custom.awesome_company).to.equal('Instana');
          })
          .then(() => {
            return control.getSpans();
          })
          .then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('aws.lambda.entry'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http).to.not.exist
            ]);
          });
      });
    }
  );

  describeOrSkipIfReduced(reduced)(
    'triggered by AWS SDK Lambda invoke function, but tracing is suppressed',
    function () {
      const env = prelude.bind(this)({
        handlerDefinitionPath,
        trigger: 'invoke-function',
        instanaAgentKey,
        traceIdContext: '1234567890abcdef',
        spanIdContext: 'fedcba9876543210',
        traceLevelContext: '0'
      });

      let control;

      before(async () => {
        control = new Control({
          faasRuntimePath: path.join(__dirname, '../runtime_mock'),
          handlerDefinitionPath,
          startBackend: true,
          env
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpansAndMetrics();
      });

      after(async () => {
        await control.stop();
      });

      it('must not trace when suppressed', () => {
        return verify(control, { error: false, expectMetrics: true, expectSpans: false });
      });
    }
  );

  describeOrSkipIfReduced(reduced)('triggered by CloudWatch Events', function () {
    // - same as "everything is peachy"
    // - but triggered by AWS CloudWatch events
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'cloudwatch-events',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize CloudWatch events trigger', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:cloudwatch.events' })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.lambda.cw).to.be.an('object'),
            span => expect(span.data.lambda.cw.events).to.be.an('object'),
            span =>
              expect(span.data.lambda.cw.events.resources).to.deep.equal([
                'arn:aws:events:us-east-2:XXXXXXXXXXXX:rule/lambda-tracing-trigger-test'
              ]),
            span => expect(span.data.lambda.cw.events.more).to.be.false
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by CloudWatch Logs', function () {
    // - same as "everything is peachy"
    // - but triggered by AWS CloudWatch logs
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'cloudwatch-logs',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize CloudWatch logs trigger', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:cloudwatch.logs' })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.lambda.cw).to.be.an('object'),
            span => expect(span.data.lambda.cw.logs).to.be.an('object'),
            span => expect(span.data.lambda.cw.logs.group).to.equal('/aws/lambda/callback_8_10'),
            span =>
              expect(span.data.lambda.cw.logs.stream).to.equal('2019/09/08/[$LATEST]3b71b6b86c614431bd1e42974f8eb981'),
            span =>
              expect(span.data.lambda.cw.logs.events).to.deep.equal([
                '2019-09-08T21:34:37.973Z\te390347f-34be-4a56-89bf-75a219fda2b3\tStarting up\n',
                '2019-09-08T21:34:37.975Z\te390347f-34be-4a56-89bf-75a219fda2b3\t' +
                  'TypeError: callback is not a function\n    at exports.handler (/var/task/index.js:7:3)\n',
                'END RequestId: e390347f-34be-4a56-89bf-75a219fda2b3\n'
              ]),
            span => expect(span.data.lambda.cw.logs.more).to.be.true
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by S3', function () {
    // - same as "everything is peachy"
    // - but triggered by AWS S3
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 's3',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });
    after(async () => {
      await control.stop();
    });

    it('must recognize S3 trigger', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:s3' })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.lambda.s3).to.be.an('object'),
            span => expect(span.data.lambda.s3.events).to.be.an('array'),
            span => expect(span.data.lambda.s3.events).to.have.length(3),
            span => expect(span.data.lambda.s3.events[0].event).to.equal('ObjectCreated:Put'),
            span => expect(span.data.lambda.s3.events[0].bucket).to.equal('lambda-tracing-test'),
            span => expect(span.data.lambda.s3.events[0].object).to.equal('test/'),
            span => expect(span.data.lambda.s3.events[1].event).to.equal('ObjectCreated:Put'),
            span => expect(span.data.lambda.s3.events[1].bucket).to.equal('lambda-tracing-test-2'),
            span => expect(span.data.lambda.s3.events[1].object).to.equal('test/two'),
            span => expect(span.data.lambda.s3.events[2].event).to.equal('ObjectCreated:Put'),
            span => expect(span.data.lambda.s3.events[2].bucket).to.equal('lambda-tracing-test-3'),
            span => expect(span.data.lambda.s3.events[2].object).to.equal('test/three'),
            span => expect(span.data.lambda.s3.more).to.be.true
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by DynamoDB', function () {
    // - same as "everything is peachy"
    // - but triggered by AWS DynamoDB
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'dynamodb',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize DynamoDB trigger', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:dynamodb' })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.lambda.dynamodb).to.be.an('object'),
            span => expect(span.data.lambda.dynamodb.events).to.be.an('array'),
            span => expect(span.data.lambda.dynamodb.events).to.have.length(3),
            span => expect(span.data.lambda.dynamodb.events[0].event).to.equal('INSERT'),
            span => expect(span.data.lambda.dynamodb.events[1].event).to.equal('INSERT'),
            span => expect(span.data.lambda.dynamodb.events[2].event).to.equal('INSERT'),
            span => expect(span.data.lambda.dynamodb.more).to.be.true
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by SQS', function () {
    // - same as "everything is peachy"
    // - but triggered by AWS SQS
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'sqs',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize SQS message trigger', () => {
      return verify(control, { error: false, expectMetrics: true, expectSpans: true, trigger: 'aws:sqs' })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.lambda.sqs).to.be.an('object'),
            span => expect(span.data.lambda.sqs.messages).to.be.an('array'),
            span => expect(span.data.lambda.sqs.messages).to.have.length(1),
            span =>
              expect(span.data.lambda.sqs.messages[0].queue).to.equal(
                'arn:aws:sqs:us-east-2:XXXXXXXXXXXX:lambda-tracing-test-queue'
              ),
            span => expect(span.data.lambda.sqs.more).to.be.false
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by SQS with parent span', function () {
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'sqs',
      instanaAgentKey,
      traceId: '1234567890abcdef',
      spanId: 'fedcba9876543210'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must continue trace from SQS message', () => {
      return verify(control, {
        error: false,
        expectMetrics: true,
        expectSpans: true,
        trigger: 'aws:sqs',
        parent: {
          t: '1234567890abcdef',
          s: 'fedcba9876543210'
        }
      })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.lambda.sqs).to.be.an('object'),
            span => expect(span.data.lambda.sqs.messages).to.be.an('array'),
            span => expect(span.data.lambda.sqs.messages).to.have.length(1),
            span =>
              expect(span.data.lambda.sqs.messages[0].queue).to.equal(
                'arn:aws:sqs:us-east-2:XXXXXXXXXXXX:lambda-tracing-test-queue'
              ),
            span => expect(span.data.lambda.sqs.more).to.be.false
          ]);
        });
    });
  });

  describeOrSkipIfReduced(reduced)('triggered by SNS-to-SQS message with parent', function () {
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'sns-to-sqs',
      instanaAgentKey,
      traceId: '1234567890abcdef',
      spanId: 'fedcba9876543210'
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must continue trace from SQS message created from an SNS notification', () => {
      return verify(control, {
        error: false,
        expectMetrics: true,
        expectSpans: true,
        trigger: 'aws:sqs',
        parent: {
          t: '1234567890abcdef',
          s: 'fedcba9876543210'
        }
      })
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.lambda.sqs).to.be.an('object'),
            span => expect(span.data.lambda.sqs.messages).to.be.an('array'),
            span => expect(span.data.lambda.sqs.messages).to.have.length(1),
            span =>
              expect(span.data.lambda.sqs.messages[0].queue).to.equal(
                'arn:aws:sqs:us-east-2:XXXXXXXXXXXX:lambda-tracing-test-queue'
              ),
            span => expect(span.data.lambda.sqs.more).to.be.false
          ]);
        });
    });
  });
  describeOrSkipIfReduced(reduced)('triggered by AWS lambda function url', function () {
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'function-url',
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath,
        startBackend: true,
        env
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must recognize the function URL trigger', () => {
      return verify(
        control,
        {
          error: false,
          expectMetrics: true,
          expectSpans: true,
          trigger: 'aws:lambda.function.url'
        },
        {
          payloadFormatVersion: '2.0'
        }
      )
        .then(() => {
          return control.getSpans();
        })
        .then(spans => {
          expectExactlyOneMatching(
            spans,
            span => expect(span.n).to.equal('aws.lambda.entry'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http.method).to.equal('GET'),
            span => expect(span.data.http.path).to.equal('/path/to'),
            span => expect(span.data.http).to.be.an('object')
          );
        });
    });
  });

  function verify(control, expectations, eventOpts) {
    return control
      .runHandler({ eventOpts })
      .then(() => verifyAfterRunningHandler(control, expectations, eventOpts && eventOpts.payloadFormatVersion));
  }

  async function verifyAfterRunningHandler(control, expectations, payloadFormatVersion) {
    return retry(
      async () => {
        const { error, expectMetrics, expectSpans } = expectations;

        /* eslint-disable no-console */
        if (error && error.startsWith('lambda')) {
          expect(control.getLambdaErrors().length).to.equal(1);
          expect(control.getLambdaResults()).to.be.empty;
          const lambdaError = control.getLambdaErrors()[0];
          expect(lambdaError).to.exist;
          if (typeof lambdaError.message === 'string') {
            expect(lambdaError.message).to.equal('Boom!');
          } else if (typeof lambdaError.message === 'object') {
            expect(lambdaError.message.content).to.equal('Boom!');
          } else {
            fail(`Unexpected type of error returned from Lambda handler ${typeof error} – ${error}`);
          }
          // other error cases like error='http' are checked in verifyLambdaEntry
        } else {
          if (control.getLambdaErrors() && control.getLambdaErrors().length > 0) {
            console.log('Unexpected Errors:');
            console.log(JSON.stringify(control.getLambdaErrors()));
          }

          expect(control.getLambdaErrors()).to.be.empty;
          expect(control.getLambdaResults().length).to.equal(1);

          const result = control.getLambdaResults()[0];
          expect(result).to.exist;
          expect(result.headers).to.be.an('object');

          if (payloadFormatVersion === '2.0') {
            expect(result.multiValueHeaders).to.not.exist;

            expect(result.headers['X-Response-Header-1']).to.equal('response header value 1, response header value 2');
            expect(result.headers['X-Response-Header-2']).to.equal('response header value 2');
            expect(result.headers['X-Response-Header-3']).to.equal('should not capture');
          } else {
            expect(result.headers['X-Response-Header-1']).to.equal('response header value 1');
            expect(result.headers['X-Response-Header-3']).to.equal('response header value 3');

            expect(result.multiValueHeaders).to.be.an('object');
            expect(result.multiValueHeaders['X-Response-Header-2']).to.deep.equal(['response', 'header', 'value 2']);
            expect(result.multiValueHeaders['X-Response-Header-4']).to.deep.equal(['response', 'header', 'value 4']);
          }

          expect(result.body).to.deep.equal({ message: 'Stan says hi!' });
        }

        if (expectMetrics && expectSpans) {
          await getAndVerifySpans(control, expectations);
          await getAndVerifyMetrics(control, expectations);
        } else if (!expectMetrics && expectSpans) {
          await getAndVerifySpans(control, expectations);
          await verifyNoMetrics(control);
        } else if (expectMetrics && !expectSpans) {
          await getAndVerifyMetrics(control, expectations);
          await verifyNoSpans(control);
        } else {
          await delay(1000);
          await verifyNoSpans(control);
          await verifyNoMetrics(control);
        }
      },
      null,
      Date.now() + config.getRetryTimeout() * 3.5
    );
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }

  function getAndVerifySpans(control, expectations) {
    return control.getSpans().then(spans => verifySpans(spans, expectations, control));
  }

  function verifySpans(spans, expectations, control) {
    const { error } = expectations;
    const entry = verifyLambdaEntry(spans, expectations);
    if (error !== 'lambda-synchronous') {
      verifyHttpExit(spans, entry, control);
    }
  }

  function verifyLambdaEntry(spans, expectations) {
    const checks = [
      span => expect(span.n).to.equal('aws.lambda.entry'),
      span => expect(span.s).to.exist,
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f).to.be.an('object'),
      span => expect(span.f.h).to.not.exist,
      span => expect(span.f.hl).to.be.true,
      span => expect(span.f.cp).to.equal('aws'),
      span => expect(span.f.e).to.equal(qualifiedArn),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.data.lambda).to.be.an('object'),
      span => expect(span.data.lambda.arn).to.equal(qualifiedArn),
      span => expect(span.data.lambda.runtime).to.equal('nodejs'),
      span => expect(span.data.lambda.reqId).to.equal('20024b9e-e726-40e2-915e-f787357738f7'),
      verifyHeaders
    ];

    if (expectations.parent) {
      checks.push(span => expect(span.t).to.equal(expectations.parent.t));
      checks.push(span => expect(span.p).to.equal(expectations.parent.s));
    } else {
      checks.push(span => expect(span.t).to.exist);
      checks.push(span => expect(span.p).to.not.exist);
    }

    if (expectations.alias) {
      checks.push(span => expect(span.data.lambda.alias).to.equal('anAlias'));
    } else {
      checks.push(span => expect(span.data.lambda.alias).to.not.exist);
    }
    if (expectations.trigger) {
      checks.push(span => expect(span.data.lambda.trigger).to.equal(expectations.trigger));
    }
    const { error } = expectations;
    if (error && error.startsWith('lambda')) {
      checks.push(span => expect(span.data.lambda.error).to.be.a('string'));
      checks.push(span => expect(span.data.lambda.error).to.include('Boom!'));
      checks.push(span => expect(span.ec).to.equal(1));
    } else if (error === 'http') {
      checks.push(span => expect(span.data.lambda.error).to.equal('HTTP status 502'));
      checks.push(span => expect(span.ec).to.equal(1));
    } else if (error === false) {
      checks.push(span => expect(span.data.lambda.error).to.not.exist);
      checks.push(span => expect(span.ec).to.equal(0));
    } else {
      throw new Error(`Unknown error expectation type, don't know how to verify: ${error}`);
    }
    if (expectations.expectColdStart === true) {
      checks.push(span => expect(span.data.lambda.coldStart).to.be.true);
    } else if (expectations.expectColdStart === false) {
      checks.push(span => expect(span.data.lambda.coldStart).to.not.exist);
    }

    return expectExactlyOneMatching(spans, checks);
  }

  function verifyHttpExit(spans, entry, control) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(entry.t),
      span => expect(span.p).to.equal(entry.s),
      span => expect(span.s).to.exist,
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f).to.be.an('object'),
      span => expect(span.f.h).to.not.exist,
      span => expect(span.f.cp).to.equal('aws'),
      span => expect(span.f.hl).to.be.true,
      span => expect(span.f.e).to.equal(qualifiedArn),
      span => expect(span.async).to.not.exist,
      span => expect(span.data.http).to.be.an('object'),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.url).to.contain(control.downstreamDummyUrl),
      span =>
        expect(span.data.http.header).to.deep.equal({
          'x-downstream-header': 'yes'
        }),
      verifyHeaders
    ]);
  }

  function verifyNoMetrics(control) {
    return control.getMetrics().then(metrics => {
      expect(metrics).to.be.empty;
    });
  }

  function getAndVerifyMetrics(control, expectations) {
    return control.getMetrics().then(metrics => verifyMetrics(metrics, expectations));
  }

  function verifyMetrics(allMetrics, expectations) {
    expect(allMetrics).to.exist;
    expect(allMetrics).to.be.an('array');
    expect(allMetrics).to.have.lengthOf(1);
    const allPlugins = allMetrics[0];
    expect(allPlugins.plugins).to.have.lengthOf(1);
    const pluginData = allPlugins.plugins[0];
    expect(pluginData.data).to.exist;
    expect(pluginData.name).to.equal('com.instana.plugin.aws.lambda');
    expect(pluginData.entityId).to.equal(qualifiedArn);
    const metrics = pluginData.data;
    expect(metrics.sensorVersion).to.match(/^\d+\.\d+.\d+(?:-rc\.\d+)?$/);
    expect(metrics.startTime).to.be.at.most(Date.now());
    expect(metrics.versions).to.be.an('object');
    expect(metrics.versions.node).to.match(/^\d+\.\d+\.\d+/);
    expect(metrics.versions.v8).to.match(/^\d+\.\d+\.\d+/);
    expect(metrics.versions.uv).to.match(/^\d+\.\d+\.\d+/);
    expect(metrics.versions.zlib).to.match(/^\d+\.\d+\.\d+/);
    verifyHeaders(allPlugins);
    if (expectations.error !== 'lambda-synchronous') {
      // A synchronous error terminates the Lambda really fast, so there might not have been enough time to collect
      // asynchronous metrics based on fs calls.
      expect(metrics.npmPackageDescription).to.equal('Instana tracing and monitoring for Node.js based AWS Lambdas');
      expect(metrics.npmPackageName).to.equal('@instana/aws-lambda');
      expect(metrics.npmPackageVersion).to.match(/\d+\.\d+\.\d+/);
    }
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal(qualifiedArn);
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.not.exist;
  }

  function getHeaderCaseInsensitive(headers, header) {
    let key = null;
    let value = null;

    Object.keys(headers).forEach(h => {
      if (header.toLowerCase() === h.toLowerCase()) {
        if (key != null) {
          throw new Error(`Found duplicated header: ${key} and ${h}.`);
        }
        key = h;
        value = headers[key];
      }
    });
    return value;
  }
}
