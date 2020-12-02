'use strict';

const { expect } = require('chai');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const { delay, retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('..//globalAgent');

describe('profiling', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // profiles are send every two minutes, so we wait for 2.5 minutes
  const testTimeout = 3 * 60 * 1000; // 3 minutes
  const retryTimeout = 2 * 60 * 1000 + 30 * 1000; // 2.5 minutes

  this.timeout(testTimeout);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('profiling', function() {
    describe('agent is up to date', function() {
      const controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          INSTANA_AUTO_PROFILE: true
        }
      }).registerTestHooks();

      it('must send profiles to the agent', () => {
        let keepTriggeringHttpRequests = true;

        function triggerHttpRequests() {
          if (keepTriggeringHttpRequests) {
            controls
              .sendRequest({
                method: 'GET',
                path: '/dummy'
              })
              .then(() => {
                setTimeout(triggerHttpRequests, 1000);
              });
          }
        }

        triggerHttpRequests();

        // eslint-disable-next-line no-console
        console.log('Waiting for profiles for 3 minutes...');

        return retry(
          () =>
            agentControls
              .getProfiles()
              .then(profiles => {
                expect(profiles.length).to.be.at.least(1);
                keepTriggeringHttpRequests = false;
                return agentControls.getSpans();
              })
              // check that the app produces continuously
              .then(spans => expect(spans.length).to.be.at.least(100)),
          retryTimeout
        );
      });
    });

    // It is unnecessary to include this in the test suite that is run on CI.
    describe.skip('agent is outdated', function() {
      agentControls.registerTestHooks({
        doesntHandleProfiles: true
      });

      const controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          INSTANA_AUTO_PROFILE: true
        }
      }).registerTestHooks();

      it('must warn when the agent does not support Node.js profiles', () => {
        let keepTriggeringHttpRequests = true;
        function triggerHttpRequests() {
          if (keepTriggeringHttpRequests) {
            controls
              .sendRequest({
                method: 'GET',
                path: '/dummy'
              })
              .then(() => {
                setTimeout(triggerHttpRequests, 1000);
              });
          }
        }

        triggerHttpRequests();

        // eslint-disable-next-line no-console
        console.log('Waiting for profiles for up to 3 minutes...');

        return delay(retryTimeout).then(() =>
          agentControls
            .getProfiles()
            .then(profiles => {
              // this does not make much sense
              expect(profiles.length).to.equal(0);
              keepTriggeringHttpRequests = false;
              return agentControls.getSpans();
            })
            // check that the app produces continuously
            .then(spans => expect(spans.length).to.be.at.least(100))
        );
      });
    });
  });
});
