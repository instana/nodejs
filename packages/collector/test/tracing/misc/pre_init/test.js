/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/preInit', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  describe('without preInit', function () {
    registerTests.call(this, false);
  });

  describe('with preInit', function () {
    registerTests.call(this, true);
  });
});

function registerTests(usePreInit) {
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      usePreInit
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it(`must ${usePreInit ? '' : 'not'} init instrumentations early and ${
    usePreInit ? '' : 'not'
  } capture log exits`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/trigger'
      })
      .then(() => verify()));

  function verify() {
    return testUtils.retry(() =>
      agentControls.getSpans().then(spans => {
        if (usePreInit) {
          expect(spans.length).to.equal(2);
        } else {
          expect(spans.length).to.equal(1);
        }

        const httpEntry = testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.p).to.not.exist,
          span => expect(span.data.http.method).to.equal('POST'),
          span => expect(span.data.http.url).to.equal('/trigger')
        ]);

        if (usePreInit) {
          testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('log.pino'),
            span => expect(span.k).to.equal(constants.EXIT),
            span => expect(span.p).to.equal(httpEntry.s),
            span =>
              expect(span.data.log.message).to.equal('Should be traced if INSTANA_EARLY_INSTRUMENTATION has been set.')
          ]);
        }
      })
    );
  }
}
