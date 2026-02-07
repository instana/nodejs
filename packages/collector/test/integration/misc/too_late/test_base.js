/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const {
  expect,
  assert: { fail }
} = require('chai');

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const agentControls = globalAgent.instance;

module.exports = function () {
  describe('tracing/too late', function () {
    this.timeout(config.getTestTimeout());
    globalAgent.setUpCleanUpHooks();

    const EXAMPLE_MODULE = 'mysql';

    describe(`@instana/collector is initialized too late (choosing ${EXAMPLE_MODULE} as an example)`, function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            REQUIRE_BEFORE_COLLECTOR: EXAMPLE_MODULE
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      it(`should warn when module ${EXAMPLE_MODULE} has been require before @instana/collector`, () =>
        controls
          .sendRequest({
            path: '/'
          })
          .then(() =>
            testUtils.retry(() =>
              Promise.all([
                agentControls.getSpans(),
                agentControls.getMonitoringEvents(),
                agentControls.getAllMetrics(controls.getPid())
              ]).then(([spans, monitoringEvents, metrics]) => {
                expect(spans.length).to.equal(1);
                // expect HTTP entry to be captured
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.error).to.not.exist,
                  span => expect(span.ec).to.equal(0),
                  span => expect(span.p).to.not.exist,
                  span => expect(span.data.http.method).to.equal('GET'),
                  span => expect(span.data.http.url).to.equal('/')
                ]);

                // expect HTTP exit to not be captured
                const httpExits = testUtils.getSpansByName(spans, 'node.http.client');
                expect(httpExits).to.have.lengthOf(0);

                // expect the initialized-too-late monitoring event to have been fired
                expect(monitoringEvents).to.deep.include(
                  {
                    plugin: 'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform',
                    pid: controls.getPid(),
                    code: 'nodejs_collector_initialized_too_late',
                    duration: 660000,
                    category: 'TRACER'
                  },
                  JSON.stringify(monitoringEvents)
                );

                // expect initTooLate to have been recorded via snapshot data too (until that mechanism is removed)
                let initTooLateFound = false;
                metrics.forEach(m => {
                  if (m && m.data) {
                    if (m.data.initTooLate === true) {
                      initTooLateFound = true;
                    } else if (m.data.initTooLate !== undefined) {
                      fail(
                        `Found invalid value (${m.data.initTooLate}, type: ${typeof m.data
                          .initTooLate}) for initTooLate metric, should be either undefined or true.`
                      );
                    }
                  }
                });
                expect(initTooLateFound).to.be.true;
              })
            )
          ));
    });

    describe('@instana/collector is initialized properly', () => {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedData();
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      it('should not warn about being initialized too late', () =>
        controls
          .sendRequest({
            path: '/'
          })
          .then(() =>
            testUtils.retry(() =>
              Promise.all([
                agentControls.getSpans(),
                agentControls.getMonitoringEvents(),
                agentControls.getAllMetrics(controls.getPid())
              ]).then(([spans, monitoringEvents, metrics]) => {
                expect(spans.length).to.equal(2);
                const httpEntry = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.p).to.not.exist,
                  span => expect(span.data.http.method).to.equal('GET'),
                  span => expect(span.data.http.url).to.equal('/')
                ]);

                // expect HTTP exit to have been captured
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.p).to.equal(httpEntry.s),
                  span => expect(span.data.http.method).to.equal('GET'),
                  span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:[0-9]+/)
                ]);

                // expect initTooLate monitoring event to NOT have been fired
                expect(monitoringEvents).to.be.empty;

                // expect initTooLate to NOT have been recorded in the snapshot data
                let initTooLateFound = false;
                metrics.forEach(m => {
                  if (m && m.data) {
                    if (m.data.initTooLate === true) {
                      initTooLateFound = true;
                    } else if (m.data.initTooLate !== undefined) {
                      fail(
                        `Found invalid value (${m.data.initTooLate}, type: ${typeof m.data
                          .initTooLate}) for initTooLate metric, should be either undefined or true.`
                      );
                    }
                  }
                });
                expect(initTooLateFound).to.be.false;
              })
            )
          ));
    });
  });
};
