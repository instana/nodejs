'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

describe('tracing/q', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  this.timeout(config.getTestTimeout());

  const appControls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true
  }).registerTestHooks();

  runTest('/fcall');
  runTest('/reject-fcall');
  runTest('/deferred');
  runTest('/reject-deferred', verifySingleEntryWithError);
  runTest('/promise');
  runTest('/sequence');
  runTest('/nested');
  runTest('/all');
  runTest('/all-settled');
  runTest('/spread');
  runTest('/any');
  runTest('/tap');
  runTest('/for-each-pattern');
  runTest('/reduce-pattern');
  runTest('/compact-reduce-pattern');
  runTest('/progress');
  runTest('/delay');
  runTest('/delay2');
  runTest('/timeout', verifySingleEntryWithError);
  runTest('/nodeify');
  runTest('/make-node-resolver');
  runTest('/with-event-emitter');
  runTest('/entry-exit', verifyEntryAndExit);

  function runTest(path, verification = verifySingleEntry) {
    it(`must trace: ${path}`, () =>
      appControls
        .sendRequest({
          method: 'GET',
          path
        })
        .then(response => verification(response, path)));
  }

  function verifySingleEntry(response, path) {
    expect(response.span).to.be.an('object');
    expect(response.error).to.not.exist;
    return testUtils.retry(() =>
      agentControls.getSpans().then(spans => {
        const entrySpan = verifyRootEntrySpan(spans, path);
        expect(response.span.t).to.equal(entrySpan.t);
        expect(spans).to.have.lengthOf(1);
      })
    );
  }

  function verifySingleEntryWithError(response, path) {
    expect(response.span).to.be.an('object');
    expect(response.error).to.equal('Boom!');
    return testUtils.retry(() =>
      agentControls.getSpans().then(spans => {
        const entrySpan = verifyRootEntrySpan(spans, path);
        expect(response.span.t).to.equal(entrySpan.t);
        expect(spans).to.have.lengthOf(1);
      })
    );
  }

  function verifyEntryAndExit(response, path) {
    return testUtils.retry(() =>
      agentControls.getSpans().then(spans => {
        expect(response.span).to.be.an('object');
        expect(response.error).to.not.exist;
        const entrySpan = verifyRootEntrySpan(spans, path);
        expect(response.span.t).to.equal(entrySpan.t);
        verifyExitSpan(spans, entrySpan);
      })
    );
  }

  function verifyRootEntrySpan(spans, path) {
    return testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.p).to.equal(undefined),
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.data.http.url).to.equal(path)
    ]);
  }

  function verifyExitSpan(spans, parentSpan) {
    return testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.t).to.equal(parentSpan.t),
      span => expect(span.p).to.equal(parentSpan.s),
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT)
    ]);
  }
});
