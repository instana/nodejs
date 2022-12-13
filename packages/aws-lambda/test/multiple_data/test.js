/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const { delay, expectExactlyNMatching, expectExactlyOneMatching } = require('../../../core/test/test_util');
const config = require('../../../serverless/test/config');

const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:us-east-2:410797082306:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;

const backendPort = 8443;
const backendBaseUrl = `https://localhost:${backendPort}/serverless`;
const downstreamDummyPort = 3456;
const downstreamDummyUrl = `http://localhost:${downstreamDummyPort}/`;
const instanaAgentKey = 'aws-lambda-dummy-key';

describe('multiple data lambda handler', function () {
  this.timeout(config.getTestTimeout());
  const control = new Control({
    faasRuntimePath: path.join(__dirname, '../runtime_mock'),
    handlerDefinitionPath: path.join(__dirname, './lambda'),
    startBackend: true,
    backendPort,
    backendBaseUrl,
    downstreamDummyUrl,
    env: {
      INSTANA_ENDPOINT_URL: backendBaseUrl,
      INSTANA_AGENT_KEY: instanaAgentKey,
      WITH_CONFIG: 'true'
    }
  });

  control.registerTestHooks();

  it('must capture metrics and all spans', () =>
    control
      .runHandler()
      .then(() => {
        const duration = Date.now() - control.startedAt;
        expect(duration).to.be.at.most(1000 * 2);
        verifyResponse(1);
      })
      .then(() => {
        return delay(1000 * 4);
      })
      .then(() => {
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
      }));

  function verifyResponse(numberOfResults) {
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
    return expectExactlyNMatching(spans, 5, span => {
      expect(span.s).to.exist;
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('aws');
      expect(span.data.http).to.be.an('object');
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal('https://www.instana.com/');
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
