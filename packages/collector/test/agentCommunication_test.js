'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const config = require('./config');
const utils = require('./utils');

describe('agentCommunication', function() {
  if (semver.satisfies(process.versions.node, '<4')) {
    return;
  }

  const agentStubControls = require('./apps/agentStubControls');
  const expressControls = require('./apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  it('must announce itself to the agent', () =>
    utils.retry(() =>
      agentStubControls.getDiscoveries().then(discoveries => {
        const discovery = discoveries[expressControls.getPid()];
        expect(discovery.pid).to.be.a('number');
        expect(discovery.fd).to.be.a('string');
        if (/linux/i.test(process.platform)) {
          expect(discovery.inode).to.be.a('string');
        }
      })
    ));

  it('must send data to the agent', () =>
    utils.retry(() =>
      agentStubControls.getLastMetricValue(expressControls.getPid(), ['pid']).then(pid => {
        expect(pid).to.equal(expressControls.getPid());
      })
    ));

  it('must reannounce itself to the agent once discoveries are cleared', () =>
    utils
      .retry(() =>
        agentStubControls.getDiscoveries().then(discoveries => {
          expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
        })
      )
      .then(() => {
        agentStubControls.deleteDiscoveries();
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getDiscoveries().then(discoveries => {
            expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
          })
        )
      ));
});
