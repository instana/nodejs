'use strict';

const expect = require('chai').expect;

const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');
const globalAgent = require('../globalAgent');

describe('actions/getModuleAnalysis', function() {
  const expressControls = require('../apps/expressControls');

  this.timeout(config.getTestTimeout());

  expressControls.registerTestHooks({
    useGlobalAgent: true
  });

  const agentControls = globalAgent.instance;
  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
  globalAgent.setUpCleanUpHooks();

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
