'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');

describe('actions/getModuleAnalysis', function() {
  if (semver.satisfies(process.versions.node, '<4')) {
    return;
  }

  const expressControls = require('../apps/expressControls');
  const agentStubControls = require('../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: supportedVersion(process.versions.node)
  });

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  it('must receive module analysis', () => {
    const messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.getModuleAnalysis',
        messageId,
        args: {}
      })
      .then(() =>
        testUtils.retry(() =>
          agentStubControls.getResponses().then(responses => {
            testUtils.expectAtLeastOneMatching(responses, [
              response => expect(response.messageId).to.equal(messageId),
              response => expect(response.data.data.cwd).to.be.a('string'),
              response => expect(response.data.data['require.main.filename']).to.be.a('string'),
              response => expect(response.data.data['require.main.paths']).to.be.an('array'),
              response => expect(response.data.data['require.cache']).to.be.an('array')
            ]);
          })
        )
      );
  });
});
