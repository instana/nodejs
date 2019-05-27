'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const config = require('../config');
const utils = require('../utils');

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
        utils.retry(() =>
          agentStubControls.getResponses().then(responses => {
            utils.expectOneMatching(responses, response => {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.data.cwd).to.be.a('string');
              expect(response.data.data['require.main.filename']).to.be.a('string');
              expect(response.data.data['require.main.paths']).to.be.an('array');
              expect(response.data.data['require.cache']).to.be.an('array');
            });
          })
        )
      );
  });
});
