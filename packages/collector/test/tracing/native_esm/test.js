/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../core/test/config');
const { retry, verifyEntrySpan } = require('../../../../core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');
const constants = require('@_local/core').tracing.constants;
const path = require('path');
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/native-esm modules', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        INSTANA_CUSTOM_INSTRUMENTATIONS: [path.resolve(__dirname, './customInstrumentation/squareCalc')]
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

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('should collect spans', async () => {
    await controls.sendRequest({
      method: 'GET',
      path: '/request'
    });

    await retry(async () => {
      const spans = await agentControls.getSpans();
      expect(spans.length).to.equal(2);
      verifyEntrySpan({
        spanName: 'node.http.server',
        spans,
        withError: false,
        pid: String(controls.getPid()),
        dataProperty: 'http',
        extraTests: [
          span => {
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/request');
            expect(span.data.http.status).to.equal(200);
          }
        ]
      });

      const calculatorSpan = spans.find(span => span.n === 'square-calc');
      expect(calculatorSpan).to.exist;
      expect(calculatorSpan.k).to.equal(constants.EXIT);
      expect(calculatorSpan.data.calculator).to.be.an('object');
    });
  });
});
