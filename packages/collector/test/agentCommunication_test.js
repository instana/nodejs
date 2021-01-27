/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const config = require('../../core/test/config');
const { retry } = require('../../core/test/test_util');
const globalAgent = require('./globalAgent');

describe('agentCommunication', function() {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const expressControls = require('./apps/expressControls');
  expressControls.registerTestHooks({ useGlobalAgent: true });

  it('must announce itself to the agent', () =>
    retry(() =>
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
    retry(() =>
      agentControls.getLastMetricValue(expressControls.getPid(), ['pid']).then(pid => {
        expect(pid).to.equal(expressControls.getPid());
      })
    ));

  it('must reannounce itself to the agent once discoveries are cleared', () =>
    retry(() =>
      agentControls.getDiscoveries().then(discoveries => {
        expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
      })
    )
      .then(() => {
        agentControls.deleteDiscoveries();
      })
      .then(() =>
        retry(() =>
          agentControls.getDiscoveries().then(discoveries => {
            expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
          })
        )
      ));
});

describe('announce retry', function() {
  describe('retry once after 10', function() {
    runRetryTest.bind(this)(29000, 20000, 1);
  });

  describe('second retry with exponential backoff', function() {
    runRetryTest.bind(this)(59000, 40000, 2);
  });

  // takes too long to include it in the general test suite
  describe.skip('lots of retries with exponential backoff', function() {
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
            const discovery = discoveries[expressControls.getPid()];
            expect(discovery).to.exist;
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
