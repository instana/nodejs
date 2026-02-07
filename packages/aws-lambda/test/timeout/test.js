/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const constants = require('@_local/core').tracing.constants;

const Control = require('../Control');
const config = require('@_local/core/test/config');
const { expectExactlyOneMatching, retry } = require('../../../core/test/test_util');

const { fail } = expect;

const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:us-east-2:767398002385:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;
const instanaAgentKey = 'aws-lambda-dummy-key';

describe('timeout heuristic', function () {
  this.timeout(config.getTestTimeout());

  const handlerDefinitionPath = path.join(__dirname, './lambda');

  describe('when the Lambda has a very short timeout and times out', function () {
    runTest.bind(this)({
      lambdaTimeout: 1000,
      delay: 1500,
      expectEntrySpan: false,
      expectTimeout: false,
      expectResponseFromLambda: false,
      enableLambdaTimeoutDetection: true
    });
  });

  describe('when the Lambda has a short timeout and times out', function () {
    runTest.bind(this)({
      lambdaTimeout: 3100,
      delay: 3500,
      expectEntrySpan: true,
      expectTimeout: true,
      expectResponseFromLambda: false,
      expectedMillisRemainingAtTimeout: 280,
      enableLambdaTimeoutDetection: true
    });
  });

  describe('when the Lambda has a short timeout and finishes just after the timeout detection', function () {
    runTest.bind(this)({
      lambdaTimeout: 3100,
      delay: 2900, // timeout is assumed after ~ 3100 ms * 0.9 ~= 2800 ms
      expectEntrySpan: true,
      expectTimeout: true,
      expectResponseFromLambda: true,
      expectedMillisRemainingAtTimeout: 280,
      enableLambdaTimeoutDetection: true
    });
  });

  describe('when the Lambda has a short timeout and finishes before the timeout detection', function () {
    runTest.bind(this)({
      lambdaTimeout: 3100,
      delay: 2000,
      expectEntrySpan: true,
      expectTimeout: false,
      expectResponseFromLambda: true,
      enableLambdaTimeoutDetection: true
    });
  });

  describe('when the Lambda has a longer timeout and times out', function () {
    runTest.bind(this)({
      lambdaTimeout: 10000,
      delay: 11000,
      expectEntrySpan: true,
      expectTimeout: true,
      expectResponseFromLambda: false,
      expectedMillisRemainingAtTimeout: 400,
      enableLambdaTimeoutDetection: true
    });
  });

  describe('when the Lambda has a longer timeout and finishes just after the timeout detection', function () {
    runTest.bind(this)({
      lambdaTimeout: 10000,
      delay: 9750,
      expectEntrySpan: true,
      expectTimeout: true,
      expectResponseFromLambda: true,
      expectedMillisRemainingAtTimeout: 400,
      enableLambdaTimeoutDetection: true
    });
  });

  describe('when the Lambda has a longer timeout and finishes before the timeout detection', function () {
    runTest.bind(this)({
      lambdaTimeout: 10000,
      delay: 8000,
      expectEntrySpan: true,
      expectTimeout: false,
      expectResponseFromLambda: true,
      enableLambdaTimeoutDetection: true
    });
  });

  describe('when the timeout detection is disabled and a timeout occurs', function () {
    runTest.bind(this)({
      lambdaTimeout: 3100,
      delay: 5000,
      expectEntrySpan: false,
      expectTimeout: false,
      expectResponseFromLambda: false,
      enableLambdaTimeoutDetection: false
    });
  });

  describe('when the timeout detection is disabled and no timeout occurs', function () {
    runTest.bind(this)({
      lambdaTimeout: 3000,
      delay: 500,
      expectEntrySpan: true,
      expectTimeout: false,
      expectResponseFromLambda: true,
      enableLambdaTimeoutDetection: false
    });
  });

  function runTest({
    lambdaTimeout,
    delay,
    expectEntrySpan,
    expectTimeout,
    expectResponseFromLambda,
    expectedMillisRemainingAtTimeout,
    enableLambdaTimeoutDetection
  }) {
    let control;

    before(async () => {
      const envs = {
        DELAY: delay,
        INSTANA_ENABLE_RUNTIME_TIMEOUT_DETECTION: true
      };

      if (enableLambdaTimeoutDetection) {
        envs.INSTANA_ENABLE_LAMBDA_TIMEOUT_DETECTION = enableLambdaTimeoutDetection;
      }

      const opts = {
        handlerDefinitionPath,
        instanaAgentKey,
        lambdaTimeout,
        env: envs
      };

      if (opts.startBackend == null) {
        opts.startBackend = true;
      }

      // eslint-disable-next-line prefer-object-spread
      const env = Object.assign(
        {
          INSTANA_AGENT_KEY: opts.instanaAgentKey,
          LAMBDA_TIMEOUT: opts.lambdaTimeout
        },
        opts.env
      );

      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: opts.handlerDefinitionPath,
        startBackend: opts.startBackend,
        env,
        lambdaTimeout: opts.lambdaTimeout
      });

      await control.start();
    });

    after(async () => {
      await control.stop();
    });

    let label;

    if (expectTimeout && !expectResponseFromLambda) {
      label = 'must detect the timeout';
    } else if (expectTimeout) {
      label = "must a assume timeout but not impact the handler's response";
    } else {
      label = 'must not detect a timeout';
    }

    it(label, () => {
      const lambdaFinishedUnexpectedlyMessage = 'The Lambda was expected to time out but it actually finished.';
      return control
        .runHandler()
        .then(() => {
          if (expectResponseFromLambda) {
            if (control.getLambdaErrors() && control.getLambdaErrors().length > 0) {
              // eslint-disable-next-line no-console
              console.log('Unexpected Errors:');
              // eslint-disable-next-line no-console
              console.log(JSON.stringify(control.getLambdaErrors()));
            }
            expect(control.getLambdaErrors()).to.be.empty;
            expect(control.getLambdaResults().length).to.equal(1);
            const result = control.getLambdaResults()[0];
            expect(result).to.exist;
            expect(result.body).to.deep.equal({ message: 'Stan says hi!' });
          } else {
            fail(lambdaFinishedUnexpectedlyMessage);
          }
        })
        .catch(e => {
          if (e.name === 'AssertionError' && e.message === lambdaFinishedUnexpectedlyMessage) {
            throw e;
          }

          expect(e.message).to.include('but it ran only 0 time(s).');
        })
        .finally(async () => {
          await retry(async () => {
            const spans = await control.getSpans();

            if (expectEntrySpan) {
              verifyLambdaEntry(
                spans,
                expectTimeout,
                expectedMillisRemainingAtTimeout - 100,
                expectedMillisRemainingAtTimeout + 100
              );
            }
          });
        });
    });
  }

  function verifyLambdaEntry(spans, expectTimeout, minRemaining, maxRemaining) {
    let expectations = [
      span => expect(span.t).to.exist,
      span => expect(span.p).to.not.exist,
      span => expect(span.s).to.exist,
      span => expect(span.n).to.equal('aws.lambda.entry'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f).to.be.an('object'),
      span => expect(span.f.hl).to.be.true,
      span => expect(span.f.cp).to.equal('aws'),
      span => expect(span.f.e).to.equal(qualifiedArn),
      span => expect(span.data.lambda).to.be.an('object'),
      span => expect(span.data.lambda.runtime).to.equal('nodejs')
    ];

    if (expectTimeout) {
      expectations = expectations.concat([
        span => expect(span.data.lambda.msleft).to.be.at.least(minRemaining),
        span => expect(span.data.lambda.msleft).to.be.at.most(maxRemaining),
        span => expect(span.ec).to.equal(1),
        span => {
          const regex = /Possible Lambda timeout with only (\d+) ms left./;

          expect(span.data.lambda.error).to.match(regex);
          const digitsFromErrorMessage = regex.exec(span.data.lambda.error)[1];
          const remainingMillisFromErrorMessage = parseInt(digitsFromErrorMessage, 10);
          expect(remainingMillisFromErrorMessage).to.equal(span.data.lambda.msleft);
        }
      ]);
    } else {
      expectations = expectations.concat([
        span => expect(span.data.lambda.msleft).to.not.exist,
        span => expect(span.ec).to.equal(0),
        span => expect(span.data.lambda.error).to.not.exist
      ]);
    }

    return expectExactlyOneMatching(spans, expectations);
  }
});
