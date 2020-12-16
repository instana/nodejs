'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

/**
 * Tests behaviour when the Instana Node.js collector is active but tracing is disabled.
 */
mochaSuiteFn('disabled tracing', function() {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const expressControls = require('../../../apps/expressControls');
  expressControls.registerTestHooks({
    useGlobalAgent: true,
    enableTracing: false
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
