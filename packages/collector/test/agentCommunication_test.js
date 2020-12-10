'use strict';

const expect = require('chai').expect;

const config = require('../../core/test/config');
const testUtils = require('../../core/test/test_util');
const globalAgent = require('./globalAgent');

describe('agentCommunication', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  const expressControls = require('./apps/expressControls');
  expressControls.registerTestHooks({ useGlobalAgent: true });

  it('must announce itself to the agent', () =>
    testUtils.retry(() =>
      agentControls.getDiscoveries().then(discoveries => {
        const discovery = discoveries[expressControls.getPid()];
        expect(discovery.pid).to.be.a('number');
        expect(discovery.fd).to.be.a('string');
        if (/linux/i.test(process.platform)) {
          expect(discovery.inode).to.be.a('string');
        }
      })
    ));

  it('must send data to the agent', () =>
    testUtils.retry(() =>
      agentControls.getLastMetricValue(expressControls.getPid(), ['pid']).then(pid => {
        expect(pid).to.equal(expressControls.getPid());
      })
    ));

  it('must reannounce itself to the agent once discoveries are cleared', () =>
    testUtils
      .retry(() =>
        agentControls.getDiscoveries().then(discoveries => {
          expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
        })
      )
      .then(() => {
        agentControls.deleteDiscoveries();
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getDiscoveries().then(discoveries => {
            expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
          })
        )
      ));
});
