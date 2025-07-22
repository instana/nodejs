/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const { expectExactlyOneMatching, retry } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

// This test reproduces a scenario where the application under monitoring uses the cls-hooked package in a specific way
// that breaks @instana/core's cls context handling. See
// packages/core/src/tracing/instrumentation/control_flow/clsHooked.js for details.

describe('tracing/no-conflict-with-cls-hooked', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    });

    await controls.startAndWaitForAgentConnection();
  });

  after(async () => {
    await controls.stop();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  // eslint-disable-next-line max-len
  it.skip('must not lose context when the application binds the http request event emitter via cls-hooked', async () => {
    const response = await controls.sendRequest({
      method: 'POST',
      path: '/api',

      // Adding a body is required to trigger the specific breakage that this test focusses on. This is because the
      // issue depends on work being triggered by the `onData` event listener of the IncomingMessage object, that both
      // the/ application under monitoring and @instan/core bind as an event-emitter.
      body: {
        what: 'ever'
      }
    });
    await verify(response);
  });

  async function verify(response) {
    expect(response['incoming-request']).to.be.an('object');
    expect(response['incoming-request'].body).to.be.an('object');
    expect(response['cls-contexts']).to.be.an('object');
    expect(response['cls-contexts']['appliation-under-monitoring']).to.equal('custom property value');

    const instanaContext = response['cls-contexts'].instana;
    expect(instanaContext).to.be.an('object');
    const traceId = instanaContext.traceId;
    const spanId = instanaContext.spanId;
    expect(traceId).to.be.a('string');
    expect(traceId).to.not.equal('unknown');
    expect(spanId).to.be.a('string');
    expect(spanId).to.not.equal('unknown');

    await retry(async () => {
      const spans = await agentControls.getSpans();
      const httpEntry = expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('node.http.server'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.p).to.not.exist,
        span => expect(span.t).to.equal(traceId),
        span => expect(span.s).to.equal(spanId),
        span => expect(span.data.http.method).to.equal('POST'),
        span => expect(span.data.http.url).to.equal('/api')
      ]);

      expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('log.pino'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.t).to.equal(traceId),
        span => expect(span.p).to.equal(httpEntry.s),
        span => expect(span.data.log.message).to.equal('Should be traced.')
      ]);
    });
  }
});
