/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const config = require('@instana/core/test/config');
const { delay, retry } = require('@instana/core/test/test_util');
const globalAgent = require('./globalAgent');
const { isNodeVersionEOL } = require('../src/util/eol');

describe('agentCommunication', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  const expressControls = require('./apps/expressControls');

  before(async () => {
    await expressControls.start({ useGlobalAgent: true });
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await expressControls.stop();
  });

  it('must announce itself to the agent', () =>
    retry(() =>
      agentControls.getDiscoveries().then(discoveries => {
        const discoveriesForPid = discoveries[expressControls.getPid()];
        expect(discoveriesForPid.length).to.be.at.least(1);
        const discovery = discoveriesForPid[0];
        expect(discovery.pid).to.be.a('number');
        expect(discovery.fd).to.be.a('string');
        if (/linux/i.test(process.platform)) {
          expect(discovery.inode).to.be.a('string');
        }
      })
    ));

  it('must send data to the agent', async () => {
    return retry(() => {
      agentControls.getLastMetricValue(expressControls.getPid(), ['pid']).then(pid => {
        expect(pid).to.equal(expressControls.getPid());
      });
    });
  });

  it('must reannounce itself to the agent once discoveries are cleared', () =>
    retry(() =>
      agentControls.getDiscoveries().then(discoveries => {
        const discoveriesForPid = discoveries[expressControls.getPid()];
        expect(discoveriesForPid.length).to.be.at.least(1);
        const discovery = discoveriesForPid[0];
        expect(discovery.pid).to.be.a('number');
      })
    )
      .then(() => {
        agentControls.deleteDiscoveries();
      })
      .then(() =>
        retry(() =>
          agentControls.getDiscoveries().then(discoveries => {
            const discoveriesForPid = discoveries[expressControls.getPid()];
            expect(discoveriesForPid.length).to.be.at.least(1);
            const discovery = discoveriesForPid[0];
            expect(discovery.pid).to.be.a('number');
          })
        )
      ));

  it('sends a Node.js EOL alert event to the agent (when applicable)', async () => {
    if (isNodeVersionEOL()) {
      await retry(async () => {
        const allEvents = await agentControls.getEvents();
        const eolEvents = allEvents.filter(
          event => event.title === `Node.js version ${process.versions.node} reached its end of life`
        );
        expect(eolEvents).to.have.length(1, 'No EOL events have been sent to the agent');
        const eolEvent = eolEvents[0];
        expect(eolEvent.title).to.match(/Node.js version .* reached its end of life/);
        expect(eolEvent.title).to.contain(process.versions.node);
        expect(eolEvent.text).to.contain('This version no longer');
        expect(eolEvent.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform');
        expect(eolEvent.id).to.equal(expressControls.getPid());
        expect(eolEvent.path).to.equal(`agent-stub-uuid/${expressControls.getPid()}/nodejs-eol`);
        expect(eolEvent.severity).to.equal(5);
        expect(eolEvent.duration).to.equal(21660000);
      });
    } else {
      await delay(2000);
      const allEvents = await agentControls.getEvents();
      const eolEvents = allEvents.filter(
        event => event.title === `Node.js version ${process.versions.node} reached its end of life`
      );
      expect(eolEvents, `Received one or more unexpected EOL events: ${JSON.stringify(eolEvents)}`).to.be.empty;
    }
  });

  // TODO: do we need this test?
  describe('announce retry', function () {
    describe('retry once after 10s', function () {
      runRetryTest.bind(this)(29000, 10 * 1000, 1);
    });

    describe('retry twice after 25s', function () {
      runRetryTest.bind(this)(59000, 25 * 1000, 2);
    });

    // takes too long to include it in the general test suite
    describe.skip('lots of retries with exponential backoff', function () {
      runRetryTest.bind(this)(300000, 45 * 1000, 7);
    });

    function runRetryTest(timeout, retryTime, rejectedAttempts) {
      this.timeout(timeout);

      beforeEach(async () => {
        expressControls.stop();

        await agentControls.rejectAnnounceAttempts(rejectedAttempts);
        await expressControls.start({
          useGlobalAgent: true,
          collectorUninitialized: true,
          env: {
            INSTANA_LOG_LEVEL: 'info'
          }
        });
      });

      afterEach(() => expressControls.stop());

      it('must retry announce ', async () => {
        await retry(
          () =>
            agentControls.getDiscoveries().then(discoveries => {
              const discoveriesForPid = discoveries[expressControls.getPid()];
              expect(discoveriesForPid.length).to.be.at.least(1);
              const discovery = discoveriesForPid[0];
              expect(discovery.pid).to.be.a('number');
              expect(discovery.fd).to.be.a('string');
              if (/linux/i.test(process.platform)) {
                expect(discovery.inode).to.be.a('string');
              }
            }),
          retryTime,
          Date.now() + timeout
        );
      });
    }
  });
});
