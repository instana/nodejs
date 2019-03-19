'use strict';

const expect = require('chai').expect;
const path = require('path');

const config = require('../../config');
const delay = require('../../util/delay');
const expectOneMatching = require('../../util/expect_matching');
const retry = require('../../util/retry');

function prelude(opts) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 4);

  if (opts.startAcceptor == null) {
    opts.startAcceptor = true;
  }

  const env = {
    LAMDBA_ERROR: opts.error
  };
  if (opts.instanaUrl) {
    env.INSTANA_URL = opts.instanaUrl;
  }

  const Control = require('../../util/control');
  const control = new Control({
    faasRuntimePath: path.join(__dirname, '../runtime_mock'),
    handlerDefinitionPath: opts.handlerDefinitionPath,
    startAcceptor: opts.startAcceptor,
    env
  });
  control.registerTestHooks();
  return control;
}

exports.registerTests = function registerTests(handlerDefinitionPath) {
  describe('when everything is peachy', () => {
    // - INSTANA_URL is configured
    // - acceptor is reachable
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl
    });

    it('must capture metrics and spans', () => verify(control, false, true));
  });

  describe('when lambda function yields an error', () => {
    // - INSTANA_URL is configured
    // - acceptor is reachable
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      error: true
    });

    it('must capture metrics and spans', () => verify(control, true, true));
  });

  describe('when INSTANA_URL is missing', () => {
    // - INSTANA_URL is missing
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath
    });

    it('must ignore the missing config gracefully', () => verify(control, false, false));
  });

  describe('when INSTANA_URL is missing and the lambda function yields an error', () => {
    // - INSTANA_URL is missing
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      error: true
    });

    it('must ignore the missing config gracefully', () => verify(control, true, false));
  });

  describe('when acceptor is down', () => {
    // - INSTANA_URL is configured
    // - acceptor is not reachable
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      startAcceptor: false
    });

    it('must ignore the failed request gracefully', () => verify(control, false, false));
  });

  describe('when acceptor is down and the lambda function yields an error', () => {
    // - INSTANA_URL is configured
    // - acceptor is not reachable
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      startAcceptor: false,
      error: true
    });

    it('must ignore the failed request gracefully', () => verify(control, true, false));
  });

  describe('when acceptor is reachable but does not respond', () => {
    // - INSTANA_URL is configured
    // - acceptor is reachable, but will never respond (verifies that a reasonable timeout is applied -
    //   the default timeout would be two minutes)
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      startAcceptor: 'unresponsive'
    });

    it('must finish swiftly', () => verify(control, false, false));
  });

  function verify(control, lambdaError, expectSpansAndMetrics) {
    if (lambdaError) {
      expect(control.getLambdaErrors().length).to.equal(1);
      expect(control.getLambdaResults()).to.be.empty;
      const error = control.getLambdaErrors()[0];
      expect(error.message).to.equal('Boom!');
    } else {
      expect(control.getLambdaErrors()).to.be.empty;
      expect(control.getLambdaResults().length).to.equal(1);
      const result = control.getLambdaResults()[0];
      expect(result.message).to.equal('Stan says hi!');
    }

    if (expectSpansAndMetrics) {
      // TODO Verify that metrics have been produced
      return retry(() => control.getSpans())
        .then(spans => expectSpan(spans))
        .then(() => control.getMetrics())
        .then(metrics => expectMetrics(metrics));
    } else {
      return delay(500)
        .then(() => control.getSpans())
        .then(spans => {
          expect(spans).to.be.empty;
        })
        .then(() => control.getMetrics())
        .then(metrics => {
          expect(metrics).to.be.empty;
        });
    }
  }

  function expectSpan(spans) {
    expectOneMatching(spans, span => {
      expect(span.ohai).to.equal('hey');
      // TODO Do Lambda triggers define spans? Which ones?
      // expect(span.t).to.exist;
      // expect(span.p).to.not.exist;
      // expect(span.n).to.equal('aws.lamdba.nodejs');
      // expect(span.k).to.equal(constants.ENTRY);
      // expect(span.async).to.equal(false);
      // expect(span.error).to.equal(false);
    });
  }

  function expectMetrics(metrics) {
    expect(metrics).to.exist;
    expect(Array.isArray(metrics)).to.be.true;
    expect(metrics.length).to.equal(1);
    expect(metrics[0].metric).to.equal(42);
  }
};
