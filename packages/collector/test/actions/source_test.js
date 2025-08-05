/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');

const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');
const globalAgent = require('../globalAgent');

describe('actions/source', function () {
  const expressControls = require('../apps/expressControls');

  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  before(async () => {
    await expressControls.start({ useGlobalAgent: true });
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await expressControls.stop();
  });

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  it('retrieve fully qualified source file', () => {
    const messageId = 'a';
    const semverPath = require.resolve('semver');

    return agentControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId,
        args: {
          file: semverPath
        }
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getResponses().then(responses => {
            testUtils.expectAtLeastOneMatching(responses, [
              response => expect(response.messageId).to.equal(messageId),
              response => expect(response.data.data).to.be.a('string'),
              response => expect(response.data.data).to.match(/SEMVER_SPEC_VERSION/i)
            ]);
          })
        )
      );
  });

  it('must allow package.json requests', () => {
    const messageId = 'a';
    return agentControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId,
        args: {
          file: path.join(process.cwd(), 'package.json')
        }
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getResponses().then(responses => {
            testUtils.expectAtLeastOneMatching(responses, [
              response => expect(response.messageId).to.equal(messageId),
              response => expect(response.data.data).to.be.a('string'),
              response => expect(response.data.data).to.match(/"name": "@instana\/collector"/i)
            ]);
          })
        )
      );
  });

  it('must not allow JSON requests', () => {
    const messageId = 'a';
    return agentControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId,
        args: {
          file: path.join(process.cwd(), 'foo.json')
        }
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getResponses().then(responses => {
            testUtils.expectAtLeastOneMatching(responses, [
              response => expect(response.messageId).to.equal(messageId),
              response => expect(response.data.error).to.match(/JavaScript file/i)
            ]);
          })
        )
      );
  });
});
