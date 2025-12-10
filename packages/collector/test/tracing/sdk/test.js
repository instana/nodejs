/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const fail = require('chai').assert.fail;

const { v4: uuid } = require('uuid');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const constants = require('@instana/core').tracing.constants;
const config = require('../../../../core/test/config');
const { expectExactlyOneMatching, isCI, retry } = require('../../../../core/test/test_util');
const delay = require('../../../../core/test/test_util/delay');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');

const waitForSpans = isCI() ? 1000 : 200;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/sdk', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let correlationId;
  let correlationType;

  beforeEach(() => {
    correlationId = uuid();
    correlationType = Math.random() > 0.5 ? 'mobile' : 'web';
  });

  describe('when tracing is enabled', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });

    ['callback', 'promise', 'async'].forEach(function (apiType) {
      registerSuite.bind(this)(apiType);

      if (apiType === 'async') {
        it(`${apiType} parallel intermediates`, async () => {
          await controls.sendRequest({
            method: 'POST',
            path: `/${apiType}/parallel-intermediates`
          });

          await delay(waitForSpans);

          const spans = await agentControls.getSpans();

          // 1 x entry, 2 x intermediate
          expect(spans.length).to.equal(3);

          const entrySpan = expectHttpEntry({
            spans,
            path: `/${apiType}/parallel-intermediates`
          });

          const intermediate2 = expectIntermediate({
            spans,
            parentEntry: entrySpan,
            name: 'eins',
            pid: controls.getPid(),
            apiType,
            checkStack: false
          });

          expectIntermediate({
            spans,
            parentEntry: intermediate2,
            name: 'zwei',
            pid: controls.getPid(),
            apiType,
            checkStack: false
          });
        });
      }
    });

    function registerSuite(apiType) {
      describe(`${apiType} API`, () => {
        it('must create an entry span without custom tags', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, correlationId, correlationType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                tagsAt: 'none',
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectHttpExit({ spans, parentEntry: customEntry, pid: controls.getPid() });
            });
          });
        });

        it('must create an entry span with tags provided at start', () => {
          controls.sendViaIpc({
            command: 'start-entry',
            type: apiType,
            withData: 'start',
            correlationId,
            correlationType
          });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                tagsAt: 'start',
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectHttpExit({ spans, parentEntry: customEntry, pid: controls.getPid() });
            });
          });
        });

        it('must create an entry span with tags provided at completion', () => {
          controls.sendViaIpc({
            command: 'start-entry',
            type: apiType,
            withData: 'end',
            correlationId,
            correlationType
          });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                tagsAt: 'end',
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectHttpExit({ spans, parentEntry: customEntry, pid: controls.getPid() });
            });
          });
        });

        it('must create an entry span with tags provided at start and completion', () => {
          controls.sendViaIpc({
            command: 'start-entry',
            type: apiType,
            withData: 'both',
            correlationId,
            correlationType
          });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                tagsAt: 'both',
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectHttpExit({ spans, parentEntry: customEntry, pid: controls.getPid() });
            });
          });
        });

        it('must create an entry span with an error', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, error: true, correlationId, correlationType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                tagsAt: 'none',
                error: true,
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectHttpExit({ spans, parentEntry: customEntry, pid: controls.getPid() });
            });
          });
        });

        it('must create an entry span with trace ID and parent span ID', () => {
          const traceId = '1234567890abcdef';
          const parentSpanId = 'fedcba9876543210';
          controls.sendViaIpc({
            command: 'start-entry',
            type: apiType,
            traceId,
            parentSpanId,
            correlationId,
            correlationType
          });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                tagsAt: 'none',
                traceId,
                parentSpanId,
                // The SDK will silently discard EUM correlation data for all spans except root entry spans, so we
                // expect crid and crtp to be not set
                expectedCrid: null,
                expectedCrtp: null
              });
              expectHttpExit({ spans, parentEntry: customEntry, pid: controls.getPid() });
            });
          });
        });

        it('must create an intermediate span', () =>
          controls
            .sendRequest({
              method: 'POST',
              path: `/${apiType}/create-intermediate`,
              qs: { correlationId, correlationType }
            })
            .then(response => {
              expect(response).does.exist;
              expect(response.indexOf('The MIT License')).to.equal(0);
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  // 1 x entry, 1 x intermediate, 1 x exit
                  expect(spans.length).to.equal(3);
                  const httpEntry = expectHttpEntry({
                    spans,
                    path: `/${apiType}/create-intermediate`,
                    expectedCrid: correlationId,
                    expectedCrtp: correlationType
                  });
                  const intermediateSpan = expectCustomFsIntermediate({
                    spans,
                    parentEntry: httpEntry,
                    pid: controls.getPid(),
                    path: /\/LICENSE$/
                  });
                  expectHttpExit({ spans, parentEntry: intermediateSpan, pid: controls.getPid() });
                })
              );
            }));

        it('must create overlapping parent and child spans', () =>
          controls
            .sendRequest({
              method: 'POST',
              path: `/${apiType}/create-overlapping-intermediates`
            })
            .then(response => {
              expect(response).to.be.eq('');

              return retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(3);
                  const httpEntry = expectHttpEntry({
                    spans,
                    path: `/${apiType}/create-overlapping-intermediates`
                  });

                  const intermediateSpan1 = expectCustomFsIntermediate({
                    spans,
                    parentEntry: httpEntry,
                    pid: controls.getPid(),
                    sdkName: 'intermediate1',
                    duration: 400
                  });

                  expectCustomFsIntermediate({
                    spans,
                    parentEntry: intermediateSpan1,
                    pid: controls.getPid(),
                    sdkName: 'intermediate2',
                    duration: 400
                  });
                })
              );
            }));

        it('must create an exit span', () =>
          controls
            .sendRequest({
              method: 'POST',
              path: `/${apiType}/create-exit`,
              qs: { correlationId, correlationType }
            })
            .then(response => {
              expect(response).does.exist;
              expect(response.indexOf('The MIT License')).to.equal(0);
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(3);
                  const httpEntry = expectHttpEntry({
                    spans,
                    path: `/${apiType}/create-exit`,
                    expectedCrid: correlationId,
                    expectedCrtp: correlationType
                  });
                  expectCustomFsExit({ spans, parentEntry: httpEntry, pid: controls.getPid(), path: /\/LICENSE$/ });
                  expectHttpExit({ spans, parentEntry: httpEntry, pid: controls.getPid() });
                })
              );
            }));

        it('must create an exit span with error', () =>
          controls
            .sendRequest({
              method: 'POST',
              path: `/${apiType}/create-exit?error=true`,
              simple: false,
              qs: { correlationId, correlationType }
            })
            .then(response => {
              expect(response).does.exist;
              expect(response).to.equal('Not Found');
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(3);
                  const httpEntry = expectHttpEntry({
                    spans,
                    path: `/${apiType}/create-exit`,
                    expectedCrid: correlationId,
                    expectedCrtp: correlationType
                  });
                  expectCustomFsExit({
                    spans,
                    parentEntry: httpEntry,
                    pid: controls.getPid(),
                    path: /\/does-not-exist$/,
                    error: true
                  });
                  expectHttpExit({ spans, parentEntry: httpEntry, pid: controls.getPid() });
                })
              );
            }));

        it('must keep the trace context when binding an event emitter', () => {
          controls.sendViaIpc({ command: 'event-emitter', type: apiType, correlationId, correlationType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: event-emitter');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectHttpExit({ spans, parentEntry: customEntry, pid: controls.getPid() });
            });
          });
        });

        it('must nest entries and exits correctly', () => {
          controls.sendViaIpc({ command: 'nest-entry-exit', type: apiType, correlationId, correlationType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: nest-entry-exit');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                functionName: /^nestEntryExit/,
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectCustomExit({
                spans,
                parentEntry: customEntry,
                pid: controls.getPid(),
                apiType
              });
            });
          });
        });

        it('must nest intermediates correctly', () => {
          controls.sendViaIpc({ command: 'nest-intermediates', type: apiType, correlationId, correlationType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: nest-intermediates');
            return agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(4);
              const customEntry = expectCustomEntry({
                spans,
                pid: controls.getPid(),
                functionName: /^nestIntermediates/,
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              const intermediate1 = expectIntermediate({
                spans,
                parentEntry: customEntry,
                name: 'intermediate-1',
                pid: controls.getPid(),
                apiType
              });
              const intermediate2 = expectIntermediate({
                spans,
                parentEntry: intermediate1,
                name: 'intermediate-2',
                pid: controls.getPid(),
                apiType
              });
              expectCustomExit({
                spans,
                parentEntry: intermediate2,
                pid: controls.getPid(),
                apiType
              });
            });
          });
        });
      });
    }

    it('must create an exit span for a synchronous operation and return the result', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/callback/create-exit-synchronous-result',
          qs: { correlationId, correlationType }
        })
        .then(response => {
          expect(response).does.exist;
          expect(response.result).to.equal(42);
          return retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(3);
              const httpEntry = expectHttpEntry({
                spans,
                path: '/callback/create-exit-synchronous-result',
                expectedCrid: correlationId,
                expectedCrtp: correlationType
              });
              expectExactlyOneMatching(spans, [
                span => expect(span.t).to.equal(httpEntry.t),
                span => expect(span.p).to.equal(httpEntry.s),
                span => expect(span.n).to.equal('sdk'),
                span => expect(span.k).to.equal(constants.EXIT),
                span => expect(span.data.sdk).to.exist,
                span => expect(span.data.sdk.name).to.equal('synchronous-exit'),
                span => expect(span.data.sdk.type).to.equal(constants.SDK.EXIT)
              ]);
              expectHttpExit({ spans, parentEntry: httpEntry, pid: controls.getPid() });
            })
          );
        }));

    it('must return results from all startXxxSpan methods', () => {
      controls.sendViaIpc({ command: 'synchronous-operations', correlationId, correlationType });
      return retry(() => {
        const ipcMessages = controls.getIpcMessages();
        checkForErrors(ipcMessages);
        expect(ipcMessages.length).to.equal(1);
        expect(ipcMessages[0]).to.equal('done: 4711');
        return retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.equal(3);
            const customEntry = expectExactlyOneMatching(spans, [
              span => expect(span.t).to.exist,
              span => expect(span.p).to.not.exist,
              span => expect(span.n).to.equal('sdk'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.sdk.name).to.equal('synchronous-entry'),
              span => expect(span.data.sdk.type).to.equal(constants.SDK.ENTRY)
            ]);
            const customIntermediate = expectExactlyOneMatching(spans, [
              span => expect(span.t).to.equal(customEntry.t),
              span => expect(span.p).to.equal(customEntry.s),
              span => expect(span.n).to.equal('sdk'),
              span => expect(span.k).to.equal(constants.INTERMEDIATE),
              span => expect(span.data.sdk.name).to.equal('synchronous-intermediate'),
              span => expect(span.data.sdk.type).to.equal(constants.SDK.INTERMEDIATE)
            ]);
            expectExactlyOneMatching(spans, [
              span => expect(span.t).to.equal(customIntermediate.t),
              span => expect(span.p).to.equal(customIntermediate.s),
              span => expect(span.n).to.equal('sdk'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.sdk.name).to.equal('synchronous-exit'),
              span => expect(span.data.sdk.type).to.equal(constants.SDK.EXIT)
            ]);
          })
        );
      });
    });
  });

  describe('when tracing is not enabled', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        tracingEnabled: false,
        useGlobalAgent: true
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });

    ['callback', 'promise', 'async'].forEach(function (apiType) {
      registerSuite.bind(this)(apiType);
    });

    function registerSuite(apiType) {
      describe(`${apiType} API`, () => {
        it('must not create entry spans', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, correlationId, correlationType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            if (ipcMessages.length !== 1) {
              // eslint-disable-next-line no-console
              console.log(
                `Wrong number of IPC messages ${ipcMessages.length}: ${JSON.stringify(ipcMessages, null, 2)}.`
              );
            }
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
          })
            .then(() => delay(waitForSpans))
            .then(() => agentControls.getSpans())
            .then(spans => {
              expect(spans).to.be.empty;
            });
        });
      });

      it('must not create intermediate spans', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: `/${apiType}/create-intermediate`,
            qs: { correlationId, correlationType }
          })
          .then(response => {
            expect(response).does.exist;
            expect(response.indexOf('The MIT License')).to.equal(0);
            return delay(waitForSpans)
              .then(() => agentControls.getSpans())
              .then(spans => {
                expect(spans).to.be.empty;
              });
          }));

      it('must not create exit spans', () =>
        controls
          .sendRequest({
            method: 'POST',
            path: `/${apiType}/create-exit`,
            qs: { correlationId, correlationType }
          })
          .then(response => {
            expect(response).does.exist;
            expect(response.indexOf('The MIT License')).to.equal(0);
            return delay(waitForSpans)
              .then(() => agentControls.getSpans())
              .then(spans => {
                expect(spans).to.be.empty;
              });
          }));
    }
  });

  describe('Suppression', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });

    it('[suppressed] should not trace sdk exit span', async () => {
      await controls.sendRequest({
        method: 'POST',
        path: '/promise/create-exit',
        suppressTracing: true
      });

      await delay(waitForSpans);
      const spans = await agentControls.getSpans();

      expect(spans.length).to.equal(0);
    });

    // NOTE: Not supported. See packages/core/src/tracing/sdk/sdk.js
    it.skip('[suppressed] should not trace sdk entry', async () => {
      controls.sendViaIpc({ command: 'start-entry', type: 'async' });

      await delay(waitForSpans);
      const spans = await agentControls.getSpans();

      expect(spans.length).to.equal(0);
    });
  });

  function expectCustomEntry({
    spans,
    pid,
    tagsAt,
    traceId,
    parentSpanId,
    error,
    functionName = /^createEntry/,
    expectedCrid,
    expectedCrtp
  }) {
    let expectations = [
      span => (traceId ? expect(span.t).to.equal(traceId) : expect(span.t).to.exist),
      span => (parentSpanId ? expect(span.p).to.equal(parentSpanId) : expect(span.p).to.not.exist),
      span => expect(span.n).to.equal('sdk'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => (expectedCrid ? expect(span.crid).to.equal(expectedCrid) : expect(span.crid).to.not.exist),
      span => (expectedCrtp ? expect(span.crtp).to.equal(expectedCrtp) : expect(span.crtp).to.not.exist)
    ];

    if (error) {
      expectations = expectations.concat([
        span => expect(span.ec).to.equal(1),
        span => expect(span.data.sdk.custom.tags.message).to.contain('Error: Boom!')
      ]);
    } else {
      expectations.push(span => expect(span.ec).to.equal(0));
    }

    expectations = expectations.concat([
      span => expect(span.data.sdk).to.exist,
      span => expect(span.data.sdk.name).to.equal('custom-entry'),
      span => expect(span.data.sdk.type).to.equal(constants.SDK.ENTRY),
      span => {
        // TODO: Remove this !error condition when the span.stack to array conversion is implemented
        if (functionName && !error) {
          // When there's an error, span.stack is overwritten with error stack string, not stack frames array
          expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/);
          expect(span.stack[0].m).to.match(functionName);
        } else if (error) {
          // For errors, span.stack is a string containing the error stack trace
          expect(span.stack).to.be.a('string');
        }
      }
    ]);

    tagsAt = tagsAt || 'none';
    switch (tagsAt) {
      case 'none':
        if (!error) {
          expectations.push(span => expect(span.data.sdk.custom).to.not.exist);
        } else {
          expectations = expectations.concat([
            span => expect(span.data.sdk.custom).to.exist,
            span => expect(span.data.sdk.custom.tags).to.exist,
            span => expect(span.data.sdk.custom.tags.start).to.not.exist,
            span => expect(span.data.sdk.custom.tags.end).to.not.exist
          ]);
        }
        break;
      case 'start':
        expectations = expectations.concat([
          span => expect(span.data.sdk.custom).to.exist,
          span => expect(span.data.sdk.custom.tags).to.exist,
          span => expect(span.data.sdk.custom.tags.start).to.equal('whatever')
        ]);
        break;
      case 'end':
        expectations = expectations.concat([
          span => expect(span.data.sdk.custom).to.exist,
          span => expect(span.data.sdk.custom.tags).to.exist,
          span => expect(span.data.sdk.custom.tags.end).to.equal('some value')
        ]);
        break;
      case 'both':
        expectations = expectations.concat([
          span => expect(span.data.sdk.custom).to.exist,
          span => expect(span.data.sdk.custom.tags).to.exist,
          span => expect(span.data.sdk.custom.tags.start).to.equal('whatever'),
          span => expect(span.data.sdk.custom.tags.end).to.equal('some value')
        ]);
        break;
      default:
        throw new Error(`Unknown value for tagsAt: ${tagsAt}`);
    }
    return expectExactlyOneMatching(spans, expectations);
  }

  function expectHttpEntry({ spans, path, expectedCrid, expectedCrtp }) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.data.http.method).to.equal('POST'),
      span => expect(span.data.http.url).to.equal(path),
      span => (expectedCrid ? expect(span.crid).to.equal(expectedCrid) : expect(span.crid).to.not.exist),
      span => (expectedCrtp ? expect(span.crtp).to.equal(expectedCrtp) : expect(span.crtp).to.not.exist)
    ]);
  }

  function expectHttpExit({ spans, parentEntry, pid }) {
    expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parentEntry.t),
      span => expect(span.p).to.equal(parentEntry.s),
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.ec).to.equal(0),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
      span => expect(span.data.http.status).to.equal(200),
      span => expect(span.crid).to.not.exist,
      span => expect(span.crtp).to.not.exist
    ]);
  }

  function expectCustomFsIntermediate({ spans, parentEntry, pid, path, error, sdkName, functionName, duration }) {
    return expectCustomFsSpan({
      spans,
      kind: 'INTERMEDIATE',
      functionName,
      parentEntry,
      pid,
      path,
      error,
      sdkName,
      duration
    });
  }

  function expectCustomFsExit({ spans, parentEntry, pid, path, error }) {
    return expectCustomFsSpan({ spans, kind: 'EXIT', functionName: /^createExit/, parentEntry, pid, path, error });
  }

  function expectCustomFsSpan({ spans, kind, functionName, parentEntry, pid, path, error, sdkName, duration }) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parentEntry.t),
      span => expect(span.p).to.equal(parentEntry.s),
      span => expect(span.n).to.equal('sdk'),
      span => expect(span.k).to.equal(constants[kind]),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.ec).to.equal(error ? 1 : 0),
      span => expect(span.data.sdk).to.be.an('object'),
      span =>
        sdkName
          ? expect(span.data.sdk.name).to.equal(sdkName)
          : expect(span.data.sdk.name).to.equal(kind === 'INTERMEDIATE' ? 'intermediate-file-access' : 'file-access'),
      span => expect(span.data.sdk.type).to.equal(constants.SDK[kind]),
      span => {
        // TODO: Remove this !error condition when the span.stack to array conversion is implemented
        if (functionName && !error) {
          // When there's an error, span.stack is overwritten with error stack string, not stack frames array
          expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/);
          expect(span.stack[0].m).to.match(functionName);
        } else if (error) {
          // For errors, span.stack is a string containing the error stack trace
          expect(span.stack).to.be.a('string');
          expect(span.stack).to.contain('Error: ENOENT');
        }
      },
      span => expect(span.data.sdk.custom).to.be.an('object'),
      span => expect(span.data.sdk.custom.tags).to.be.an('object'),
      span =>
        path &&
        expect(span.data.sdk.custom.tags.path).to.match(path) &&
        expect(span.data.sdk.custom.tags.encoding).to.equal('UTF-8'),
      span =>
        error
          ? expect(span.data.sdk.custom.tags.error.indexOf('ENOENT: no such file or directory')).to.equal(0)
          : expect(span.data.sdk.custom.tags.success).to.be.true,
      span => duration && expect(span.d).to.be.closeTo(duration, 50)
    ]);
  }

  function expectIntermediate({ spans, parentEntry, name, pid, apiType, checkStack = true }) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parentEntry.t),
      span => expect(span.p).to.equal(parentEntry.s),
      span => expect(span.n).to.equal('sdk'),
      span => expect(span.k).to.equal(constants.INTERMEDIATE),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.ec).to.equal(0),
      span => (checkStack ? expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/) : true),
      span =>
        checkStack
          ? expect(span.stack[0].m).to.match(apiType === 'async' ? /^nestIntermediatesAsync$/ : /createIntermediate/)
          : true,
      span => expect(span.data.sdk).to.exist,
      span => expect(span.data.sdk.name).to.equal(name),
      span => expect(span.data.sdk.type).to.equal(constants.SDK.INTERMEDIATE),
      span => expect(span.data.sdk.custom).to.not.exist,
      span => expect(span.crid).to.not.exist,
      span => expect(span.crtp).to.not.exist
    ]);
  }

  function expectCustomExit({ spans, parentEntry, pid, apiType }) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parentEntry.t),
      span => expect(span.p).to.equal(parentEntry.s),
      span => expect(span.n).to.equal('sdk'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.ec).to.equal(0),
      span => expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/),
      span => expect(span.stack[0].m).to.match(apiType === 'async' ? /^nest.*Async$/ : /createExit/),
      span => expect(span.data.sdk).to.exist,
      span => expect(span.data.sdk.name).to.equal('custom-exit'),
      span => expect(span.data.sdk.type).to.equal(constants.SDK.EXIT),
      span => expect(span.data.sdk.custom).to.not.exist,
      span => expect(span.crid).to.not.exist,
      span => expect(span.crtp).to.not.exist
    ]);
  }

  function checkForErrors(ipcMessages) {
    for (let i = 0; i < ipcMessages.length; i++) {
      const msg = ipcMessages[i];
      if (msg.indexOf('error: ') === 0) {
        fail(`IPC error: ${msg}`);
      }
    }
  }
});
