'use strict';

var delay = require('bluebird').delay;
var expect = require('chai').expect;
var fail = require('chai').assert.fail;

var supportedVersion = require('@instana/core').tracing.supportedVersion;
var constants = require('@instana/core').tracing.constants;
var config = require('../../config');
var utils = require('../../utils');

var waitForSpans = process.env.CI ? 1000 : 200;

describe('tracing/sdk', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentControls = require('../../apps/agentStubControls');
  var Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  describe('when tracing is enabled', function() {
    agentControls.registerTestHooks();
    var controls = new Controls({
      agentControls: agentControls
    });
    controls.registerTestHooks();

    ['callback', 'promise'].forEach(function(apiType) {
      registerSuite.bind(this)(apiType);
    });

    function registerSuite(apiType) {
      describe(apiType + ' API', function() {
        it('must create an entry span without custom tags', function() {
          controls.sendViaIpc({ command: 'start-entry', type: apiType });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), 'none');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with tags provided at start', function() {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, withData: 'start' });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), 'start');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with tags provided at completion', function() {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, withData: 'end' });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), 'end');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with tags provided at start and completion', function() {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, withData: 'both' });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), 'both');
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with an error', function() {
          controls.sendViaIpc({ command: 'start-entry', type: apiType, error: true });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), 'none', null, null, null, true);
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an entry span with trace ID and parent span ID', function() {
          var traceId = 'trace-id';
          var parentSpanId = 'parent-span-id';
          controls.sendViaIpc({
            command: 'start-entry',
            type: apiType,
            traceId: traceId,
            parentSpanId: parentSpanId
          });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: start-entry');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), 'none', traceId, parentSpanId);
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must create an intermediate span', function() {
          return controls
            .sendRequest({
              method: 'POST',
              path: '/' + apiType + '/create-intermediate'
            })
            .then(function(response) {
              expect(response).does.exist;
              expect(response.indexOf('The MIT License')).to.equal(0);
              return utils.retry(function() {
                return agentControls.getSpans().then(function(spans) {
                  var httpEntry = expectHttpEntry(spans, '/' + apiType + '/create-intermediate');
                  var intermediateSpan = expectCustomFsIntermediate(spans, httpEntry, controls.getPid(), /\/LICENSE$/);
                  expectHttpExit(spans, intermediateSpan, controls.getPid());
                });
              });
            });
        });

        it('must create an exit span', function() {
          return controls
            .sendRequest({
              method: 'POST',
              path: '/' + apiType + '/create-exit'
            })
            .then(function(response) {
              expect(response).does.exist;
              expect(response.indexOf('The MIT License')).to.equal(0);
              return utils.retry(function() {
                return agentControls.getSpans().then(function(spans) {
                  var httpEntry = expectHttpEntry(spans, '/' + apiType + '/create-exit');
                  expectCustomFsExit(spans, httpEntry, controls.getPid(), /\/LICENSE$/);
                  expectHttpExit(spans, httpEntry, controls.getPid());
                });
              });
            });
        });

        it('must create an exit span with error', function() {
          return controls
            .sendRequest({
              method: 'POST',
              path: '/' + apiType + '/create-exit?error=true',
              simple: false
            })
            .then(function(response) {
              expect(response).does.exist;
              expect(response).to.equal('Not Found');
              return utils.retry(function() {
                return agentControls.getSpans().then(function(spans) {
                  var httpEntry = expectHttpEntry(spans, '/' + apiType + '/create-exit');
                  expectCustomFsExit(spans, httpEntry, controls.getPid(), /\/does-not-exist$/, true);
                  expectHttpExit(spans, httpEntry, controls.getPid());
                });
              });
            });
        });

        it('must keep the trace context when binding an event emitter', function() {
          controls.sendViaIpc({ command: 'event-emitter', type: apiType });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: event-emitter');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid());
              expectHttpExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must nest entries and exits correctly', function() {
          controls.sendViaIpc({ command: 'nest-entry-exit', type: apiType });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: nest-entry-exit');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), null, null, null, /^nestEntryExit/);
              expectCustomExit(spans, customEntry, controls.getPid());
            });
          });
        });

        it('must nest intermediates correctly', function() {
          controls.sendViaIpc({ command: 'nest-intermediates', type: apiType });
          return utils.retry(function() {
            var ipcMessages = controls.getIpcMessages();
            checkForErrors(ipcMessages);
            expect(ipcMessages.length).to.equal(1);
            expect(ipcMessages[0]).to.equal('done: nest-intermediates');
            return agentControls.getSpans().then(function(spans) {
              var customEntry = expectCustomEntry(spans, controls.getPid(), null, null, null, /^nestIntermediates/);
              var intermediate1 = expectIntermediate(spans, customEntry, 'intermediate-1', controls.getPid());
              var intermediate2 = expectIntermediate(spans, intermediate1, 'intermediate-2', controls.getPid());
              expectCustomExit(spans, intermediate2, controls.getPid());
            });
          });
        });
      });
    }
  });

  describe('when tracing is not enabled', function() {
    agentControls.registerTestHooks();
    var controls = new Controls({
      tracingEnabled: false,
      agentControls: agentControls
    });
    controls.registerTestHooks();

    ['callback', 'promise'].forEach(function(apiType) {
      registerSuite.bind(this)(apiType);
    });

    function registerSuite(apiType) {
      describe(apiType + ' API', function() {
        it('must not create entry spans', function() {
          controls.sendViaIpc({ command: 'start-entry', type: apiType });
          return utils
            .retry(function() {
              var ipcMessages = controls.getIpcMessages();
              checkForErrors(ipcMessages);
              expect(ipcMessages.length).to.equal(1);
              expect(ipcMessages[0]).to.equal('done: start-entry');
            })
            .then(function() {
              return delay(waitForSpans);
            })
            .then(function() {
              return agentControls.getSpans();
            })
            .then(function(spans) {
              expect(spans).to.be.empty;
            });
        });
      });

      it('must not create intermediate spans', function() {
        return controls
          .sendRequest({
            method: 'POST',
            path: '/' + apiType + '/create-intermediate'
          })
          .then(function(response) {
            expect(response).does.exist;
            expect(response.indexOf('The MIT License')).to.equal(0);
            return delay(waitForSpans)
              .then(function() {
                return agentControls.getSpans();
              })
              .then(function(spans) {
                expect(spans).to.be.empty;
              });
          });
      });

      it('must not create exit spans', function() {
        return controls
          .sendRequest({
            method: 'POST',
            path: '/' + apiType + '/create-exit'
          })
          .then(function(response) {
            expect(response).does.exist;
            expect(response.indexOf('The MIT License')).to.equal(0);
            return delay(waitForSpans)
              .then(function() {
                return agentControls.getSpans();
              })
              .then(function(spans) {
                expect(spans).to.be.empty;
              });
          });
      });
    }
  });

  function expectCustomEntry(spans, pid, tagsAt, traceId, parentSpanId, functionName, error) {
    functionName = functionName || /^createEntry/;
    return utils.expectOneMatching(spans, function(span) {
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
      expect(span.async).to.equal(false);
      // eslint-disable-next-line no-unneeded-ternary
      expect(span.error).to.equal(error ? true : false);
      expect(span.ec).to.equal(error ? 1 : 0);
      expect(span.data.sdk).to.exist;
      expect(span.data.sdk.name).to.equal('custom-entry');
      expect(span.data.sdk.type).to.equal(constants.SDK.ENTRY);
      expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/);
      expect(span.stack[0].m).to.match(functionName);
      tagsAt = tagsAt || 'none';
      switch (tagsAt) {
        case 'none':
          expect(span.data.sdk.custom).to.not.exist;
          break;
        case 'start':
          expect(span.data.sdk.custom).to.exist;
          expect(span.data.sdk.custom.tags.start).to.equal('whatever');
          break;
        case 'end':
          expect(span.data.sdk.custom).to.exist;
          expect(span.data.sdk.custom.tags.end).to.equal('some value');
          break;
        case 'both':
          expect(span.data.sdk.custom).to.exist;
          expect(span.data.sdk.custom.tags.start).to.equal('whatever');
          expect(span.data.sdk.custom.tags.end).to.equal('some value');
          break;
        default:
          throw new Error('Unknown value for tagsAt: ' + tagsAt);
      }
    });
  }

  function expectHttpEntry(spans, path) {
    return utils.expectOneMatching(spans, function(span) {
      expect(span.n).to.equal('node.http.server');
      expect(span.data.http.method).to.equal('POST');
      expect(span.data.http.url).to.equal(path);
    });
  }

  function expectHttpExit(spans, parentEntry, pid) {
    utils.expectOneMatching(spans, function(span) {
      expect(span.t).to.equal(parentEntry.t);
      expect(span.p).to.equal(parentEntry.s);
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.e).to.equal(String(pid));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.equal(false);
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
      expect(span.data.http.status).to.equal(200);
    });
  }

  function expectCustomFsIntermediate(spans, parentEntry, pid, path, error) {
    return expectCustomFsSpan(spans, 'INTERMEDIATE', /^createIntermediate/, parentEntry, pid, path, error);
  }

  function expectCustomFsExit(spans, parentEntry, pid, path, error) {
    return expectCustomFsSpan(spans, 'EXIT', /^createExit/, parentEntry, pid, path, error);
  }

  function expectCustomFsSpan(spans, kind, functionName, parentEntry, pid, path, error) {
    return utils.expectOneMatching(spans, function(span) {
      expect(span.t).to.equal(parentEntry.t);
      expect(span.p).to.equal(parentEntry.s);
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants[kind]);
      expect(span.f.e).to.equal(String(pid));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      // eslint-disable-next-line no-unneeded-ternary
      expect(span.error).to.equal(error ? true : false);
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
    return utils.expectOneMatching(spans, function(span) {
      expect(span.t).to.equal(parentEntry.t);
      expect(span.p).to.equal(parentEntry.s);
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants.INTERMEDIATE);
      expect(span.f.e).to.equal(String(pid));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.be.false;
      expect(span.ec).to.equal(0);
      expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/);
      expect(span.stack[0].m).to.match(/createIntermediate/);
      expect(span.data.sdk).to.exist;
      expect(span.data.sdk.name).to.equal(name);
      expect(span.data.sdk.type).to.equal(constants.SDK.INTERMEDIATE);
      expect(span.data.sdk.custom).to.not.exist;
    });
  }

  function expectCustomExit(spans, parentEntry, pid) {
    return utils.expectOneMatching(spans, function(span) {
      expect(span.t).to.equal(parentEntry.t);
      expect(span.p).to.equal(parentEntry.s);
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f.e).to.equal(String(pid));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.equal(false);
      expect(span.error).to.be.false;
      expect(span.ec).to.equal(0);
      expect(span.stack[0].c).to.match(/test\/tracing\/sdk\/app.js$/);
      expect(span.stack[0].m).to.match(/createExit/);
      expect(span.data.sdk).to.exist;
      expect(span.data.sdk.name).to.equal('custom-exit');
      expect(span.data.sdk.type).to.equal(constants.SDK.EXIT);
      expect(span.data.sdk.custom).to.not.exist;
    });
  }

  function checkForErrors(ipcMessages) {
    for (var i = 0; i < ipcMessages.length; i++) {
      var msg = ipcMessages[i];
      if (msg.indexOf('error: ') === 0) {
        fail('IPC error: ' + msg);
      }
    }
  }
});
