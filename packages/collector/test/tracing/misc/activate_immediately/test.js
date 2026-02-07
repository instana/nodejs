/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const { AgentStubControls } = require('../../../apps/agentStubControls');
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/activateImmediately', function () {
  this.timeout(config.getTestTimeout());

  let customAgent;
  let appControls;

  before(async () => {
    customAgent = new AgentStubControls();

    await customAgent.startAgent({
      slowHostResponse: true
    });

    appControls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      agentControls: customAgent,
      collectorUninitialized: true,
      env: {
        INSTANA_TRACE_IMMEDIATELY: 'true',
        INSTANA_AGENT_REQUEST_TIMEOUT: '6000'
      }
    });

    await appControls.start();
    await testUtils.delay(100);

    await appControls.sendRequest({
      method: 'GET',
      path: '/trigger'
    });
  });

  beforeEach(async () => {
    await customAgent.clearReceivedTraceData();
  });

  after(async () => {
    await appControls.stop();
    await customAgent.stopAgent();
  });

  afterEach(async () => {
    await appControls.clearIpcMessages();
  });

  it('must trace', async () => {
    return testUtils.retry(() =>
      customAgent.getSpans().then(spans => {
        expect(spans.length).to.equal(2);

        testUtils.expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.k).to.equal(constants.ENTRY)
        ]);

        testUtils.expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.client'),
          span => expect(span.k).to.equal(constants.EXIT)
        ]);
      })
    );
  });
});
