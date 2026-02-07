/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');

const config = require('@_local/core/test/config');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function () {
  /**
   * Tests behaviour when the Instana Node.js collector is active but tracing is disabled.
   */
  describe('disabled tracing', function () {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const expressControls = require('@_local/collector/test/apps/expressControls');

    before(async () => {
      await expressControls.start({ useGlobalAgent: true, enableTracing: false });
    });

    after(async () => {
      await expressControls.stop();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

    it('must not send any spans to the agent', () =>
      expressControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 201
        })
        .then(() => Promise.delay(500))
        .then(() =>
          agentControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(0);
          })
        ));
  });
};
