/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const {
  retry,
  expectExactlyNMatching,
  expectExactlyOneMatching,
  delay,
  isCI
} = require('../../../core/test/test_util');
const config = require('@instana/core/test/config');

const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:us-east-2:767398002385:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;

const instanaAgentKey = 'aws-lambda-dummy-key';

describe.only('multiple data', function () {
  this.timeout(config.getTestTimeout() * 2);

  describe('[batching disabled] with 3 iterations', function () {
    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: path.join(__dirname, './lambda'),
        startBackend: true,
        env: {
          INSTANA_AGENT_KEY: instanaAgentKey,
          WITH_CONFIG: 'true',
          INSTANA_NUMBER_OF_ITERATIONS: 3
        }
      });

      await control.start();
    });

    beforeEach(async () => {
      // wait a little to ensure no more spans are sent from the handler
      // the handler sends some async request in the background
      await delay(2000);

      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and all spans', () => {
      return control
        .runHandler()
        .then(() => {
          // Tekton CI is really unreliable. We need to be very relaxed with the duration
          if (!isCI()) {
            const duration = Date.now() - control.startedAt;
            expect(duration).to.be.at.most(1000 * 3);
          }

          verifyResponse(control, 1);
        })
        .then(() => {
          return retry(() => {
            return Promise.all([
              //
              control.getSpans(),
              control.getRawBundles(),
              control.getRawSpanArrays()
            ]).then(([spans, rawBundles, rawSpanArrays]) => {
              verifySpans(spans);
              expect(rawSpanArrays).to.be.an('array');
              // We only send one bundle request with 1 entry and 3 exits.
              expect(rawSpanArrays.length).to.equal(0);
              expect(rawBundles).to.be.an('array');
              expect(rawBundles.length).to.equal(1);
              expect(rawBundles[0].spans.length).to.equal(4);
            });
          }, 500);
        });
    });
  });

  describe('[batching enabled] with 100 iterations', function () {
    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: path.join(__dirname, './lambda'),
        startBackend: true,
        env: {
          INSTANA_AGENT_KEY: instanaAgentKey,
          WITH_CONFIG: 'true',
          INSTANA_NUMBER_OF_ITERATIONS: 100,
          INSTANA_SPANBATCHING_ENABLED: 'true',
          // 10ms is default.
          // HTTP requests to local dummy is <1s
          // We don't care about this configuration for this test.
          // Ensure the test is not flaky
          INSTANA_DEV_BATCH_THRESHOLD: 500
        }
      });

      await control.start();
    });

    beforeEach(async () => {
      // wait a little to ensure no more spans are sent from the handler
      // the handler sends some async request in the background
      await delay(2000);

      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and all spans', () => {
      return control
        .runHandler()
        .then(() => {
          verifyResponse(control, 1);
        })
        .then(() => {
          return retry(() => {
            return Promise.all([
              //
              control.getSpans(),
              control.getRawBundles(),
              control.getRawSpanArrays()
            ]).then(([spans, rawBundles, rawSpanArrays]) => {
              // 1 X bundle request at the end of the lambda fn
              expect(rawBundles.length).to.equal(1);

              // 1 x entry and 1 exit (100 batched http requests) span in the bundle.
              expect(rawBundles[0].spans.length).to.equal(2);

              // No additional /traces requests, only the one bundle request.
              expect(rawSpanArrays.length).to.equal(0);
            });
          }, 500);
        });
    });
  });

  describe('[batching disabled] with 100 iterations, all at once', function () {
    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: path.join(__dirname, './lambda'),
        startBackend: true,
        env: {
          INSTANA_AGENT_KEY: instanaAgentKey,
          WITH_CONFIG: 'true',
          INSTANA_NUMBER_OF_ITERATIONS: 100
        }
      });

      await control.start();
    });

    beforeEach(async () => {
      // wait a little to ensure no more spans are sent from the handler
      // the handler sends some async request in the background
      await delay(2000);

      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and all spans', () => {
      return control
        .runHandler()
        .then(() => {
          verifyResponse(control, 1);
        })
        .then(() => {
          return retry(() => {
            return Promise.all([
              //
              control.getSpans(),
              control.getRawBundles(),
              control.getRawSpanArrays()
            ]).then(([spans, rawBundles, rawSpanArrays]) => {
              // 1 X bundle request at the end of the lambda fn
              expect(rawBundles.length).to.equal(1);

              // All spans are sent at the end of the lambda fn
              expect(rawBundles[0].spans.length).to.equal(101);

              // 0 requests from span buffer.
              expect(rawSpanArrays.length).to.equal(0);

              expect(spans.length).to.equal(101);
            });
          }, 500);
        });
    });
  });

  describe('[batching disabled] with 100 iterations, 10 exits per request', function () {
    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: path.join(__dirname, './lambda'),
        startBackend: true,
        // HTTPS requests + NODE_TLS_REJECT_UNAUTHORIZED creates a log.console span
        // see .mocharc
        // backendHttps: false,
        env: {
          INSTANA_AGENT_KEY: instanaAgentKey,
          WITH_CONFIG: 'true',
          INSTANA_NUMBER_OF_ITERATIONS: 100,
          INSTANA_FORCE_TRANSMISSION_STARTING_AT: 10,
          INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS: 100
        }
      });

      await control.start();
    });

    beforeEach(async () => {
      // wait a little to ensure no more spans are sent from the handler
      // the handler sends some async request in the background
      await delay(2000);

      await control.reset();
      await control.resetBackendSpansAndMetrics();
    });

    after(async () => {
      await control.stop();
    });

    it('must capture metrics and all spans', () => {
      return control
        .runHandler()
        .then(() => {
          verifyResponse(control, 1);
        })
        .then(() => {
          return retry(() => {
            return Promise.all([
              //
              control.getSpans(),
              control.getRawBundles(),
              control.getRawSpanArrays()
            ]).then(([spans, rawBundles, rawSpanArrays]) => {
              // 1 X bundle request at the end of the lambda fn
              // Contains the entry span!
              expect(rawBundles.length).to.equal(1);

              // expect(rawBundles[0].spans.length).to.equal(1);

              // x requests from span buffer.
              expect(rawSpanArrays.length).to.equal(10);
              expect(rawSpanArrays[0].length).to.equal(10);
              expect(rawSpanArrays[1].length).to.equal(10);
              expect(rawSpanArrays[2].length).to.equal(10);
              expect(rawSpanArrays[3].length).to.equal(10);
              expect(rawSpanArrays[4].length).to.equal(10);
              expect(rawSpanArrays[5].length).to.equal(10);
              expect(rawSpanArrays[6].length).to.equal(10);
              expect(rawSpanArrays[7].length).to.equal(10);
              expect(rawSpanArrays[8].length).to.equal(10);

              expect(spans.length).to.equal(101);
            });
          }, 500);
        });
    });
  });

  function verifyResponse(control, numberOfResults) {
    /* eslint-disable no-console */
    if (control.getLambdaErrors() && control.getLambdaErrors().length > 0) {
      console.log('Unexpected Errors:');
      console.log(JSON.stringify(control.getLambdaErrors()));
    }
    expect(control.getLambdaErrors()).to.be.empty;
    const results = control.getLambdaResults();
    expect(results.length).to.equal(numberOfResults);
    for (let i = 0; i < results.length; i++) {
      const result = control.getLambdaResults()[i];
      expect(result).to.exist;
      const body = result.body;
      expect(body.message).to.equal('Stan says hi!');
    }
  }

  function verifySpans(spans) {
    verifyLambdaEntries(spans);
    verifyHttpExit(spans);
  }

  function verifyHttpExit(spans) {
    return expectExactlyNMatching(spans, 3, span => {
      expect(span.s).to.exist;
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('aws');
      expect(span.data.http).to.be.an('object');
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.contain('localhost');
    });
  }

  function verifyLambdaEntries(spans) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.exist;
      expect(span.p).to.not.exist;
      expect(span.s).to.exist;
      expect(span.n).to.equal('aws.lambda.entry');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('aws');
      expect(span.f.e).to.equal(qualifiedArn);
      expect(span.async).to.not.exist;
      expect(span.data.lambda).to.be.an('object');
      expect(span.data.lambda.runtime).to.equal('nodejs');
      expect(span.data.lambda.error).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
    });
  }
});
