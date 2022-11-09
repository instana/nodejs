/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const { delay, isCI, retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const { AgentStubControls } = require('../apps/agentStubControls');

// This suite is ignored on CI as the profiler (by design) is not entirely deterministc in behavior.
const mochaSuiteFn = !supportedVersion(process.versions.node) || isCI() ? describe.skip : describe;

mochaSuiteFn('profiling', function () {
  // profiles are send every two minutes. We wait a bit more than twice that time.
  const testTimeout = 6 * 60 * 1000;
  const retryTimeout = 5 * 60 * 1000;

  this.timeout(testTimeout);

  let keepTriggeringHttpRequests;

  describe('agent is up to date', function () {
    const agentControls = new AgentStubControls();
    agentControls.registerTestHooks();

    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls,
      env: {
        INSTANA_AUTO_PROFILE: true
      }
    }).registerTestHooks();

    it('must send profiles to the agent', () => {
      keepTriggeringHttpRequests = true;
      triggerHttpRequests(controls);

      // eslint-disable-next-line no-console
      console.log('Waiting for profiles...');

      return retry(() => {
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
      }, retryTimeout);
    });
  });

  describe('agent is outdated', function () {
    const agentControls = new AgentStubControls();
    agentControls.registerTestHooks({
      doesntHandleProfiles: true
    });

    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls,
      env: {
        INSTANA_AUTO_PROFILE: true
      }
    }).registerTestHooks();

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
});
