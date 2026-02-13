/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@_local/core').tracing.constants;

const Control = require('../Control');
const { expectExactlyOneMatching } = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const retry = require('@_local/core/test/test_util/retry');
const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'serverless-collector-dummy-key';

function prelude() {}

describe('[serverless-collector] using the api', function () {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  describe('when configured properly', function () {
    const env = prelude.bind(this)();
    let control;

    before(async () => {
      control = new Control({
        env,
        containerAppPath,
        instanaAgentKey,
        startDownstreamDummy: false,
        startBackend: true
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpans();
    });

    after(async () => {
      await control.stop();
    });

    it('should trace http requests', () => {
      return control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => {
          return verify(control, response);
        });
    });
  });

  describe('when not configured properly', function () {
    const env = prelude.bind(this)({});
    let control;

    before(async () => {
      control = new Control({
        env,
        containerAppPath,
        instanaAgentKey,
        startDownstreamDummy: false,
        startBackend: true,
        unconfigured: false,
        serverlessUninitialized: true
      });

      await control.start();
    });

    beforeEach(async () => {
      await control.reset();
      await control.resetBackendSpans();
    });

    after(async () => {
      await control.stop();
    });

    it('should provide a no-op API', () => {
      return control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => {
          return verifyNoOp(control, response);
        });
    });
  });

  function verify(control, response) {
    expect(response).to.be.an('object');
    expect(response.message).to.equal('Hello from Serverless Collector App!');
    expect(response.logs.error).to.be.empty;
    expect(response.currentSpan.span.n).to.equal('node.http.server');
    expect(response.currentSpan.span.f.hl).to.be.true;
    expect(response.currentSpan.span.f.e).to.exist;
    expect(response.currentSpanConstructor).to.equal('SpanHandle');
    return retry(() => getAndVerifySpans(control));
  }

  function getAndVerifySpans(control) {
    return control.getSpans().then(spans => verifySpans(spans, control));
  }

  function verifySpans(spans, control) {
    const entry = verifyHttpEntry(spans, control);
    verifyCustomExit(spans, entry);
  }

  function verifyHttpEntry(spans, control) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.exist;
      expect(span.p).to.not.exist;
      expect(span.s).to.exist;
      expect(span.n).to.equal('node.http.server');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.e).to.exist;
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal('/');
      expect(span.data.http.host).to.equal(`127.0.0.1:${control.getPort()}`);
      expect(span.data.http.status).to.equal(200);
      expect(span.ec).to.equal(0);
      expect(span._receivedHeaders['x-instana-host']).to.equal('nodejs-serverless');
    });
  }

  function verifyCustomExit(spans, entry) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(entry.t);
      expect(span.p).to.equal(entry.s);
      expect(span.s).to.exist;
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.e).to.exist;
      expect(span.data.sdk.name).to.equal('custom-span');
      expect(span.data.sdk.type).to.equal('exit');
      expect(span.ec).to.equal(0);
    });
  }

  function verifyNoOp(control, response) {
    expect(response).to.be.an('object');
    expect(response.message).to.equal('Hello from Serverless Collector App!');
    expect(response.logs).to.deep.equal({
      debug: [],
      info: [],
      warn: [],
      error: []
    });
    expect(response.currentSpan).to.deep.equal({});
    expect(response.currentSpanConstructor).to.equal('NoopSpanHandle');
    return verifyNoSpans(control);
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }
});
