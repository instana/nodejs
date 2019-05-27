'use strict';

const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const config = require('../config');
const utils = require('../utils');

describe('actions/source', function() {
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

  it('retrieve fully qualified source file', () => {
    const messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId,
        args: {
          file: path.join(process.cwd(), 'node_modules', 'semver', 'semver.js')
        }
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getResponses().then(responses => {
            utils.expectOneMatching(responses, response => {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.data).to.be.a('string');
              expect(response.data.data).to.match(/SEMVER_SPEC_VERSION/i);
            });
          })
        )
      );
  });

  it('must allow package.json requests', () => {
    const messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId,
        args: {
          file: path.join(process.cwd(), 'package.json')
        }
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getResponses().then(responses => {
            utils.expectOneMatching(responses, response => {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.data).to.be.a('string');
              expect(response.data.data).to.match(/"name": "@instana\/collector"/i);
            });
          })
        )
      );
  });

  it('must not allow JSON requests', () => {
    const messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId,
        args: {
          file: path.join(process.cwd(), 'foo.json')
        }
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getResponses().then(responses => {
            utils.expectOneMatching(responses, response => {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.error).to.match(/JavaScript file/i);
            });
          })
        )
      );
  });
});
