/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const config = require('@instana/core/test/config');
const { retry } = require('@instana/core/test/test_util');
const globalAgent = require('./globalAgent');
const { isNodeVersionEOL } = require('../src/util/eol');

const isEOL = isNodeVersionEOL();

describe('agentCommunication', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const expressControls = require('./apps/expressControls');
  expressControls.registerTestHooks({ useGlobalAgent: true });

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

  it('must send data to the agent', () =>
    retry(() =>
      agentControls.getLastMetricValue(expressControls.getPid(), ['pid']).then(pid => {
        expect(pid).to.equal(expressControls.getPid());
      })
    ));

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

  it('sends a Node.js EOL alert event to the agent (when applicable)', async () =>
    retry(async () => {
      const events = await agentControls.getEvents();

      if (events.length === 0 && isEOL) {
        return Promise.reject(new Error('No EOL alert event sent to the agent'));
      } else {
        const eolEvent = events.filter(
          event => event.title === `Node.js version ${process.versions.node} reached its end of life`
        );
        expect(eolEvent).to.exist;
      }
    }));
});

describe('announce retry', function () {
  describe('retry once after 10', function () {
    runRetryTest.bind(this)(29000, 20000, 1);
  });

  describe('second retry with exponential backoff', function () {
    runRetryTest.bind(this)(59000, 40000, 2);
  });

  // takes too long to include it in the general test suite
  describe.skip('lots of retries with exponential backoff', function () {
    runRetryTest.bind(this)(300000, 290000, 7);
  });

  function runRetryTest(timeout, retryTime, rejectedAttempts) {
    this.timeout(timeout);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const expressControls = require('./apps/expressControls');

    beforeEach(async () => {
      await agentControls.rejectAnnounceAttempts(rejectedAttempts);
      return expressControls.start({
        useGlobalAgent: true,
        env: {
          INSTANA_LOG_LEVEL: 'info'
        }
      });
    });
    afterEach(() => expressControls.stop());

    it('must retry announce ', () =>
      retry(
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
        retryTime
      ));
  }
});
