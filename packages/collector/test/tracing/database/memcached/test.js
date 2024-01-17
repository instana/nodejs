/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, stringifyItems, delay } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const expectAtLeastOneMatching = require('@instana/core/test/test_util/expectAtLeastOneMatching');
const expectExactlyOneMatching = require('@instana/core/test/test_util/expectExactlyOneMatching');
const {
  verifyHttpRootEntry,
  verifyHttpExit,
  verifyExitSpan
} = require('@instana/core/test/test_util/common_verifications');

let mochaSuiteFn;

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

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cache/memcached', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    const appControls = new ProcessControls({
      dirname: __dirname,
      env: {}
    });

    ProcessControls.setUpHooks(appControls);

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
    this.timeout(config.getTestTimeout() / 2);

    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      tracingEnabled: false,
      env: {}
    });

    ProcessControls.setUpHooks(appControls);

    describe('sequential operations that are not instrumented', () => {
      sequentialOps.forEach(operation => {
        it(`should not trace (${operation})`, async () => {
          await appControls.sendRequest({
            method: 'GET',
            path: `/${operation}`
          });
          retry(() => delay(config.getTestTimeout() / 4)).then(() => {
            agentControls.getSpans().then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (Memcached suppressed: ${stringifyItems(spans)}`);
              }
            });
          });
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
              .then(retry(() => delay(config.getTestTimeout() / 4)))
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
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      env: {}
    });

    ProcessControls.setUpHooks(appControls);

    describe('sequential operations are not traced', () => {
      sequentialOps.forEach(operation => {
        it(`should not trace (${operation})`, async () => {
          await appControls.sendRequest({
            suppressTracing: true,
            method: 'GET',
            path: `/${operation}`
          });

          return retry(() => delay(config.getTestTimeout() / 4)).then(
            agentControls.getSpans().then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (Memcached suppressed: ${stringifyItems(spans)}`);
              }
            })
          );
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
              .then(retry(() => delay(config.getTestTimeout() / 4)))
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
});
