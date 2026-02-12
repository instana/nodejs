/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const globalAgent = require('../globalAgent');

describe('actions/getModuleAnalysis', function () {
  this.timeout(config.getTestTimeout());

  const expressControls = require('../apps/expressControls');
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

  it('must receive module analysis', () => {
    const messageId = 'a';
    return agentControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.getModuleAnalysis',
        messageId,
        args: {}
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getResponses().then(responses => {
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
