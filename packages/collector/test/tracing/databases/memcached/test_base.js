/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const config = require('@instana/core/test/config');
const { retry, stringifyItems, delay } = require('@instana/core/test/test_util');
const ProcessControls = require('@instana/collector/test/test_util/ProcessControls');
const globalAgent = require('@instana/collector/test/globalAgent');
const expectAtLeastOneMatching = require('@instana/core/test/test_util/expectAtLeastOneMatching');
const expectExactlyOneMatching = require('@instana/core/test/test_util/expectExactlyOneMatching');
const {
  verifyHttpRootEntry,
  verifyHttpExit,
  verifyExitSpan
} = require('@instana/core/test/test_util/common_verifications');

const SPAN_NAME = 'memcached';

const withErrorOptions = [false, true];

// initial operations that must run sequentially
const sequentialOps = ['del', 'add'];
// subsequent operations that can run in parallel
const parallelOps = [
  //
  'set',
  'append',
  'prepend',
  'touch',
  'replace',
  'get',
  'getMulti',
  'gets',
  'incr',
  'decr',
  'cas'
];

const availableOperations = sequentialOps.concat(parallelOps);

const retryTime = 1000;

module.exports = function (name, version, isLatest) {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name
        }
      });

      await appControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await appControls.stop();
    });

    afterEach(async () => {
      await appControls.clearIpcMessages();
    });

    withErrorOptions.forEach(withError => {
      if (!withError) {
        describe('instrumenting sequential operations with success', () => {
          sequentialOps.forEach(operation => {
            it(`operation: ${operation}`, async () => {
              const withErrorOption = withError ? '?withError=true' : '';
              const apiPath = `/${operation}`;

              const response = await appControls.sendRequest({
                method: 'GET',
                path: `${apiPath}${withErrorOption}`,
                simple: withError === false
              });

              return verify(appControls, response, apiPath, withError, operation);
            });
          });
        });

        describe('instrumenting non sequential operations with success', () => {
          it(`should instrument ${parallelOps.join(', ')}`, () =>
            Promise.all(
              parallelOps.map(op => {
                const apiPath = `/${op}`;

                return appControls
                  .sendRequest({
                    method: 'GET',
                    path: `${apiPath}`,
                    simple: withError === false
                  })
                  .then(response => verify(appControls, response, apiPath, withError, op))
                  .catch(Promise.reject);
              })
            ));
        });
      } else {
        describe('instrumenting with API error', () => {
          it(`should test ${availableOperations.join(', ')}`, () =>
            Promise.all(
              availableOperations.map(op => {
                const apiPath = `/${op}`;
                return appControls
                  .sendRequest({
                    method: 'GET',
                    path: `${apiPath}?withError=true`,
                    simple: withError === false
                  })
                  .then(response => verify(appControls, response, apiPath, withError, op))
                  .catch(Promise.reject);
              })
            ));
        });
      }
    });

    function verify(controls, response, apiPath, withError, operation) {
      return retry(
        () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, withError, operation)),
        retryTime
      );
    }

    function verifySpans(controls, spans, apiPath, withError, operation) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });
      verifyExitSpan({
        spanName: SPAN_NAME,
        spans,
        parent: httpEntry,
        withError,
        pid: String(controls.getPid()),
        extraTests: [
          span => expect(typeof span.data.memcached.key).to.equal('string'),
          span => {
            if (!withError) {
              if (operation === 'del') {
                expect(span.data.memcached.operation).to.equal('delete');
              } else {
                expect(span.data.memcached.operation).to.equal(operation);
              }
            }
          },
          span => expect(span.data.memcached.connection).to.match(/localhost|127\.0\.0\.1/)
        ],
        testMethod: operation === 'cas' ? expectAtLeastOneMatching : expectExactlyOneMatching
      });

      if (!withError) {
        verifyHttpExit({
          spans,
          parent: httpEntry,
          pid: String(controls.getPid()),
          testMethod: operation === 'cas' ? expectAtLeastOneMatching : expectExactlyOneMatching
        });
      }
    }
  });

  describe('tracing disabled', () => {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name
        }
      });

      await appControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await appControls.stop();
    });

    afterEach(async () => {
      await appControls.clearIpcMessages();
    });

    describe('sequential operations that are not instrumented', () => {
      sequentialOps.forEach(operation => {
        it(`should not trace (${operation})`, async () => {
          await appControls.sendRequest({
            method: 'GET',
            path: `/${operation}`
          });

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans: ${stringifyItems(spans)}`);
          }
        });
      });
    });

    describe('non sequential operations that are not instrumented', () => {
      it(`does not instrument ${parallelOps.join(', ')}`, () =>
        Promise.all(
          parallelOps.map(op =>
            appControls
              .sendRequest({
                method: 'GET',
                path: `/${op}`
              })
              .then(retry(() => delay(1000)))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (Memcached suppressed: ${stringifyItems(spans)}`);
                  return Promise.reject();
                } else {
                  return Promise.resolve();
                }
              })
              .catch(Promise.reject)
          )
        ));
    });
  });

  describe('tracing enabled but suppressed', () => {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name
        }
      });

      await appControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await appControls.stop();
    });

    afterEach(async () => {
      await appControls.clearIpcMessages();
    });

    describe('sequential operations are not traced', () => {
      sequentialOps.forEach(operation => {
        it(`should not trace (${operation})`, async () => {
          await appControls.sendRequest({
            suppressTracing: true,
            method: 'GET',
            path: `/${operation}`
          });

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans: ${stringifyItems(spans)}`);
          }
        });
      });
    });

    describe('non sequential operations are not traced', () => {
      it(`should not trace (${parallelOps.join(', ')})`, () =>
        Promise.all(
          parallelOps.map(op =>
            appControls
              .sendRequest({
                suppressTracing: true,
                method: 'GET',
                path: `/${op}`
              })
              .then(retry(() => delay(1000)))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans Memcached suppressed: ${stringifyItems(spans)}`);
                  return Promise.reject();
                } else {
                  return Promise.resolve();
                }
              })
              .catch(Promise.reject)
          )
        ));
    });
  });
};
