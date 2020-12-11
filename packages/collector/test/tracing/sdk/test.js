'use strict';

const expect = require('chai').expect;
const fail = require('chai').assert.fail;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const constants = require('@instana/core').tracing.constants;
const config = require('../../../../core/test/config');
const { expectExactlyOneMatching, retry } = require('../../../../core/test/test_util');
const delay = require('../../../../core/test/test_util/delay');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');

const waitForSpans = process.env.CI ? 1000 : 200;

describe('tracing/sdk', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('when tracing is enabled', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    }).registerTestHooks();

    ['callback', 'promise'].forEach(function(apiType) {
      registerSuite.bind(this)(apiType);
    });

    function registerSuite(apiType) {
      describe(`${apiType} API`, () => {
        it('must create an entry span without custom tags', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(spans, controls.getPid(), 'none');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with tags provided at start', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, withData: 'start' });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(spans, controls.getPid(), 'start');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with tags provided at completion', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, withData: 'end' });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(spans, controls.getPid(), 'end');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with tags provided at start and completion', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, withData: 'both' });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(spans, controls.getPid(), 'both');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with an error', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, error: true });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(
                spans,
                controls.getPid(),
                'none',
                undefined,
                undefined,
                undefined,
                true
              );
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with trace ID and parent span ID', () => {
          const traceId = 'trace-id';
          const parentSpanId = 'parent-span-id';
          controls.sendViaIpc({
            command: 'start-entry',
            type: apiType,
            traceId,
            parentSpanId
          });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(spans, controls.getPid(), 'none', traceId, parentSpanId);
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an intermediate span', () =>
          controls
            .sendRequest({
              method: 'POST',
              path: `/${apiType}/create-intermediate`
            })
            .then(response => {
              expect(response).does.exist;
              expect(response.indexOf('The MIT License')).to.equal(0);
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  const httpEntry = expectHttpEntry(spans, `/${apiType}/create-intermediate`);
                  const intermediateSpan = expectCustomFsIntermediate(
                    spans,
                    httpEntry,
                    controls.getPid(),
                    /\/LICENSE$/
                  );
                  expectHttpExit(spans, intermediateSpan, controls.getPid());
                })
              );
            }));

        it('must create an exit span', () =>
          controls
            .sendRequest({
              method: 'POST',
              path: `/${apiType}/create-exit`
            })
            .then(response => {
              expect(response).does.exist;
              expect(response.indexOf('The MIT License')).to.equal(0);
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  const httpEntry = expectHttpEntry(spans, `/${apiType}/create-exit`);
                  expectCustomFsExit(spans, httpEntry, controls.getPid(), /\/LICENSE$/);
                  expectHttpExit(spans, httpEntry, controls.getPid());
                })
              );
            }));

        it('must create an exit span with error', () =>
          controls
            .sendRequest({
              method: 'POST',
              path: `/${apiType}/create-exit?error=true`,
              simple: false
            })
            .then(response => {
              expect(response).does.exist;
              expect(response).to.equal('Not Found');
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  const httpEntry = expectHttpEntry(spans, `/${apiType}/create-exit`);
                  expectCustomFsExit(spans, httpEntry, controls.getPid(), /\/does-not-exist$/, true);
                  expectHttpExit(spans, httpEntry, controls.getPid());
                })
              );
            }));

        it('must keep the trace context when binding an event emitter', () => {
          controls.sendViaIpc({ command: 'event-emitter', type: apiType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: event-emitter');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(spans, controls.getPid());
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must nest entries and exits correctly', () => {
          controls.sendViaIpc({ command: 'nest-entry-exit', type: apiType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: nest-entry-exit');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(
                spans,
                controls.getPid(),
                undefined,
                undefined,
                undefined,
                /^nestEntryExit/
              );
              expectCustomExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must nest intermediates correctly', () => {
          controls.sendViaIpc({ command: 'nest-intermediates', type: apiType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: nest-intermediates');
            return agentControls.getSpans().then(spans => {
              const customEntry = expectCustomEntry(spans, controls.getPid(), null, null, null, /^nestIntermediates/);
              const intermediate1 = expectIntermediate(spans, customEntry, 'intermediate-1', controls.getPid());
              const intermediate2 = expectIntermediate(spans, intermediate1, 'intermediate-2', controls.getPid());
              expectCustomExit(spans, intermediate2, controls.getPid());
            });
          });
        });
      });
    }

    it('must create an exit span for a synchronous operation and return the result', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/callback/create-exit-synchronous-result'
        })
        .then(response => {
          expect(response).does.exist;
          expect(response.result).to.equal(42);
          return retry(() =>
            agentControls.getSpans().then(spans => {
              const httpEntry = expectHttpEntry(spans, '/callback/create-exit-synchronous-result');
              expectExactlyOneMatching(spans, [
                span => expect(span.t).to.equal(httpEntry.t),
                span => expect(span.p).to.equal(httpEntry.s),
                span => expect(span.n).to.equal('sdk'),
                span => expect(span.k).to.equal(constants.EXIT),
                span => expect(span.data.sdk).to.exist,
                span => expect(span.data.sdk.name).to.equal('synchronous-exit'),
                span => expect(span.data.sdk.type).to.equal(constants.SDK.EXIT)
              ]);
              expectHttpExit(spans, httpEntry, controls.getPid());
            })
          );
        }));

    it('must return results from all startXxxSpan methods', () => {
      controls.sendViaIpc({ command: 'synchronous-operations' });
      return retry(() => {
        const ipcMessages = controls.getIpcMessages();
        checkForErrors(ipcMessages);
        expect(ipcMessages.length).to.equal(1);
        expect(ipcMessages[0]).to.equal('done: 4711');
        return retry(() =>
          agentControls.getSpans().then(spans => {
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
    const controls = new ProcessControls({
      dirname: __dirname,
      tracingEnabled: false,
      useGlobalAgent: true
    }).registerTestHooks();

    ['callback', 'promise'].forEach(function(apiType) {
      registerSuite.bind(this)(apiType);
    });

    function registerSuite(apiType) {
      describe(`${apiType} API`, () => {
        it('must not create entry spans', () => {
          controls.sendViaIpc({ command: 'start-entry', type: apiType });
          return retry(() => {
            const ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
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
            path: `/${apiType}/create-intermediate`
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
            path: `/${apiType}/create-exit`
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

  function expectCustomEntry(spans, pid, tagsAt, traceId, parentSpanId, functionName = /^createEntry/, error) {
    return expectExactlyOneMatching(spans, span => {
      if (traceId) {
        expect(span.t).to.equal(traceId);
      } else {
        expect(span.t).to.exist;
      }
      if (parentSpanId) {
        expect(span.p).to.equal(parentSpanId);
      } else {
        expect(span.p).to.not.exist;
      }
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f.e).to.equal(String(pid));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      // eslint-disable-next-line no-unneeded-ternary
      expect(span.error).to.not.exist;
      if (error) {
        expect(span.ec).to.equal(1);
        expect(span.data.sdk.custom.tags.message).to.contain('Error: Boom!\n');
        expect(span.data.sdk.custom.tags.message).to.contain('packages/collector/test/tracing/sdk/app.js:104:35');
      } else {
        expect(span.ec).to.equal(0);
      }
      expect(span.data.sdk).to.exist;
      expect(span.data.sdk.name).to.equal('custom-entry');
      expect(span.data.sdk.type).to.equal(constants.SDK.ENTRY);
      expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/);
      expect(span.stack[0].m).to.match(functionName);
      tagsAt = tagsAt || 'none';
      switch (tagsAt) {
        case 'none':
          if (!error) {
            expect(span.data.sdk.custom).to.not.exist;
          } else {
            expect(span.data.sdk.custom).to.exist;
            expect(span.data.sdk.custom.tags).to.exist;
            expect(span.data.sdk.custom.tags.start).to.not.exist;
            expect(span.data.sdk.custom.tags.end).to.not.exist;
          }
          break;
        case 'start':
          expect(span.data.sdk.custom).to.exist;
          expect(span.data.sdk.custom.tags).to.exist;
          expect(span.data.sdk.custom.tags.start).to.equal('whatever');
          break;
        case 'end':
          expect(span.data.sdk.custom).to.exist;
          expect(span.data.sdk.custom.tags).to.exist;
          expect(span.data.sdk.custom.tags.end).to.equal('some value');
          break;
        case 'both':
          expect(span.data.sdk.custom).to.exist;
          expect(span.data.sdk.custom.tags).to.exist;
          expect(span.data.sdk.custom.tags.start).to.equal('whatever');
          expect(span.data.sdk.custom.tags.end).to.equal('some value');
          break;
        default:
          throw new Error(`Unknown value for tagsAt: ${tagsAt}`);
      }
    });
  }

  function expectHttpEntry(spans, path) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.data.http.method).to.equal('POST'),
      span => expect(span.data.http.url).to.equal(path)
    ]);
  }

  function expectHttpExit(spans, parentEntry, pid) {
    expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parentEntry.t),
      span => expect(span.p).to.equal(parentEntry.s),
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
      span => expect(span.data.http.status).to.equal(200)
    ]);
  }

  function expectCustomFsIntermediate(spans, parentEntry, pid, path, error) {
    return expectCustomFsSpan(spans, 'INTERMEDIATE', /^createIntermediate/, parentEntry, pid, path, error);
  }

  function expectCustomFsExit(spans, parentEntry, pid, path, error) {
    return expectCustomFsSpan(spans, 'EXIT', /^createExit/, parentEntry, pid, path, error);
  }

  function expectCustomFsSpan(spans, kind, functionName, parentEntry, pid, path, error) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(parentEntry.t);
      expect(span.p).to.equal(parentEntry.s);
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants[kind]);
      expect(span.f.e).to.equal(String(pid));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      // eslint-disable-next-line no-unneeded-ternary
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(error ? 1 : 0);
      expect(span.data.sdk).to.exist;
      expect(span.data.sdk.name).to.equal(kind === 'INTERMEDIATE' ? 'intermediate-file-access' : 'file-access');
      expect(span.data.sdk.type).to.equal(constants.SDK[kind]);
      expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/);
      expect(span.stack[0].m).to.match(functionName);
      expect(span.data.sdk.custom).to.exist;
      expect(span.data.sdk.custom.tags).to.exist;
      expect(span.data.sdk.custom.tags.path).to.match(path);
      expect(span.data.sdk.custom.tags.encoding).to.equal('UTF-8');
      if (error) {
        expect(span.data.sdk.custom.tags.error.indexOf('ENOENT: no such file or directory')).to.equal(0);
      } else {
        expect(span.data.sdk.custom.tags.success).to.be.true;
      }
    });
  }

  function expectIntermediate(spans, parentEntry, name, pid) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parentEntry.t),
      span => expect(span.p).to.equal(parentEntry.s),
      span => expect(span.n).to.equal('sdk'),
      span => expect(span.k).to.equal(constants.INTERMEDIATE),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
      span => expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/),
      span => expect(span.stack[0].m).to.match(/createIntermediate/),
      span => expect(span.data.sdk).to.exist,
      span => expect(span.data.sdk.name).to.equal(name),
      span => expect(span.data.sdk.type).to.equal(constants.SDK.INTERMEDIATE),
      span => expect(span.data.sdk.custom).to.not.exist
    ]);
  }

  function expectCustomExit(spans, parentEntry, pid) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parentEntry.t),
      span => expect(span.p).to.equal(parentEntry.s),
      span => expect(span.n).to.equal('sdk'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(pid)),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
      span => expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/),
      span => expect(span.stack[0].m).to.match(/createExit/),
      span => expect(span.data.sdk).to.exist,
      span => expect(span.data.sdk.name).to.equal('custom-exit'),
      span => expect(span.data.sdk.type).to.equal(constants.SDK.EXIT),
      span => expect(span.data.sdk.custom).to.not.exist
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
