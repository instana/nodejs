/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const { delay, isCI, isCILongRunning, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');

module.exports = function () {
  // profiles are send every two minutes. We wait a bit more than twice that time.
  const testTimeout = 6 * 60 * 1000;
  const retryTimeout = 60 * 1000;

  this.timeout(testTimeout);

  let mochaSuiteFn = describe;
  if (isCI() && !isCILongRunning()) {
    mochaSuiteFn = describe.skip;
  }

  let keepTriggeringHttpRequests;

  mochaSuiteFn('agent is up to date', function () {
    const agentControls = new AgentStubControls();
    let controls;

    before(async () => {
      await agentControls.startAgent();

      controls = new ProcessControls({
        dirname: __dirname,
        agentControls,
        env: {
          INSTANA_AUTO_PROFILE: true
        }
      });

      await controls.start();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
      await agentControls.stopAgent();
    });

    it('must send profiles to the agent', () => {
      keepTriggeringHttpRequests = true;
      triggerHttpRequests(controls);

      // eslint-disable-next-line no-console
      console.log('Waiting for profiles...');

      return retry(
        () => {
          // eslint-disable-next-line no-console
          console.log('...still waiting for profiles...');
          return (
            agentControls
              .getProfiles()
              .then(profiles => {
                expect(profiles.length).to.be.at.least(1);
                keepTriggeringHttpRequests = false;
                return agentControls.getSpans();
              })
              // check that the app produces spans continuously
              .then(spans => expect(spans.length).to.be.at.least(100))
          );
        },
        retryTimeout,
        Date.now() + testTimeout
      );
    });
  });

  mochaSuiteFn('agent is outdated', function () {
    const agentControls = new AgentStubControls();
    let controls;

    before(async () => {
      await agentControls.startAgent({
        doesntHandleProfiles: true
      });

      controls = new ProcessControls({
        dirname: __dirname,
        agentControls,
        env: {
          INSTANA_AUTO_PROFILE: true
        }
      });

      await controls.start();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await agentControls.stopAgent();
      await controls.stop();
    });

    it('must warn when the agent does not support Node.js profiles', () => {
      keepTriggeringHttpRequests = true;
      triggerHttpRequests(controls);

      // eslint-disable-next-line no-console
      console.log('Waiting for profiles for 3 minutes...');

      return delay(3 * 60 * 1000).then(() =>
        agentControls
          .getProfiles()
          .then(profiles => {
            expect(profiles.length).to.equal(0);
            keepTriggeringHttpRequests = false;
            return agentControls.getSpans();
          })
          // check that the app produces spans continuously
          .then(spans => expect(spans.length).to.be.at.least(100))
      );
    });
  });

  function triggerHttpRequests(controls) {
    if (keepTriggeringHttpRequests) {
      controls
        .sendRequest({
          method: 'GET',
          path: '/dummy'
        })
        .then(() => {
          setTimeout(triggerHttpRequests, 1000, controls);
        });
    }
  }
};
