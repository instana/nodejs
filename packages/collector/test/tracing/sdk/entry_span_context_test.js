/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const fail = require('chai').assert.fail;
const path = require('path');

const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const { retry } = require('@_local/core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/sdk - force separate context for startEntrySpan', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  ['AsyncLocalStorage', 'legacy cls-hooked'].forEach(function (contextImplementation) {
    describe(contextImplementation, function () {
      const env = {};
      if (contextImplementation === 'legacy cls-hooked') {
        env.INSTANA_FORCE_LEGACY_CLS = true;
      }

      let controls;

      before(async () => {
        controls = new ProcessControls({
          appPath: path.join(__dirname, 'entry_span_context_app'),
          useGlobalAgent: true,
          env
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

      ['non-recursive', 'recursive'].forEach(callPattern => {
        ['async', 'promise', 'callback'].forEach(apiType => {
          it(
            `${callPattern} calls to instana.sdk.${apiType}.startEntrySpan should create a new root context for ` +
              'each entry span',
            async () => {
              const iterations = 5;
              controls.sendViaIpc({
                callPattern,
                apiType,
                iterations
              });
              let spans;
              await retry(async () => {
                const ipcMessages = controls.getIpcMessages();
                checkForErrors(ipcMessages);
                expect(ipcMessages.length).to.equal(1);
                expect(ipcMessages[0]).to.equal('done');
                spans = await agentControls.getSpans();
                expect(spans).to.have.length(iterations);
              });
              spans.forEach(span => {
                expect(span.data.sdk.custom.tags['parent-context']).to.deep.equal({});
              });
            }
          );
        });
      });
    });
  });

  function checkForErrors(ipcMessages) {
    for (let i = 0; i < ipcMessages.length; i++) {
      const msg = ipcMessages[i];
      if (msg.indexOf('error: ') === 0) {
        fail(`IPC error: ${msg}`);
      }
    }
  }
});
