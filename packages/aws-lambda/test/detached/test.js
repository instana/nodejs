/*
 * (c) Copyright IBM Corp. 2025
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

describe('aws-lambda: detached requests', function () {
  this.timeout(config.getTestTimeout());
  let control;

  before(async () => {
    control = new Control({
      faasRuntimePath: path.join(__dirname, '../runtime_mock'),
      handlerDefinitionPath: path.join(__dirname, './lambda'),
      startBackend: true,
      env: {
        INSTANA_AGENT_KEY: instanaAgentKey,
        WITH_CONFIG: 'true'
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
            expect(rawSpanArrays).to.have.lengthOf(2);
            expect(rawBundles).to.be.an('array');
            expect(rawBundles).to.have.lengthOf.at.least(1);
            expect(rawBundles).to.have.lengthOf.at.most(4);
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
  return expectExactlyNMatching(spans, 2, span => {
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
