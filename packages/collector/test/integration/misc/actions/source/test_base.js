/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');

const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function () {
  const expressControls = require('@_local/collector/test/apps/expressControls');

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

  it('must not allow any request', () => {
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
              response => expect(response.data.error).to.match(/functionality disabled./i)
            ]);
          })
        )
      );
  });

  it('must not allow any request', () => {
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
              response => expect(response.data.error).to.match(/functionality disabled./i)
            ]);
          })
        )
      );
  });
};
