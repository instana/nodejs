'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');

/**
 * Tests behaviour when the Instana Node.js collector is active but tracing is disabled.
 */
describe('disabled tracing', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentStubControls = require('../../../apps/agentStubControls');
  const expressControls = require('../../../apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: false
  });

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  it('must not send any spans to the agent', () =>
    expressControls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201
      })
      .then(() => Promise.delay(500))
      .then(() =>
        agentStubControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(0);
        })
      ));
});
