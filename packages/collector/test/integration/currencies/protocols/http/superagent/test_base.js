/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const { expectExactlyOneMatching, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  const commonEnv = {
    LIBRARY_LATEST: isLatest,
    LIBRARY_VERSION: version,
    LIBRARY_NAME: name
  };

  let serverControls;
  let clientControls;

  before(async () => {
    serverControls = new ProcessControls({
      dirname: __dirname,
      appName: 'serverApp',
      useGlobalAgent: true
    });
    clientControls = new ProcessControls({
      dirname: __dirname,
      appName: 'superagentApp',
      useGlobalAgent: true,
      env: {
        ...commonEnv,
        SERVER_PORT: serverControls.getPort()
      }
    });

    await serverControls.startAndWaitForAgentConnection();
    await clientControls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  after(async () => {
    await serverControls.stop();
    await clientControls.stop();
  });

  afterEach(async () => {
    await serverControls.clearIpcMessages();
    await clientControls.clearIpcMessages();
  });

  it('must trace superagent callbacks', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/callback'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/callback', '/request-url-opts'))
        )
      ));

  it('must trace superagent promises', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/then'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/then', '/request-url-opts'))
        )
      ));

  it('must trace superagent promises/catch', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/catch'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/catch', '/does-not-exist'))
        )
      ));

  it('must trace superagent with async/await', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/await'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/await', '/request-url-opts'))
        )
      ));

  it('must trace superagent with async/await and error', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/await-fail'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/await-fail', '/does-not-exist'))
        )
      ));

  function verifySuperagentSpans(spans, clientEndpoint, serverEndpoint) {
    const entryInClient = expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.data.http.url).to.equal(clientEndpoint),
      span => expect(span.data.http.host).to.equal(`localhost:${clientControls.getPort()}`),
      span => expect(span.p).to.not.exist
    ]);
    const firstExitInClient = expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.t).to.equal(entryInClient.t),
      span => expect(span.p).to.equal(entryInClient.s),
      span => expect(span.data.http.url).to.equal(`http://localhost:${serverControls.getPort()}${serverEndpoint}`),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.status).to.equal(serverEndpoint === '/does-not-exist' ? 404 : 200)
    ]);
    expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.t).to.equal(entryInClient.t),
      span => expect(span.p).to.equal(entryInClient.s),
      span => expect(span.data.http.url).to.equal(`http://127.0.0.1:${globalAgent.instance.agentPort}/ping`)
    ]);
    expectExactlyOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.t).to.equal(firstExitInClient.t),
      span => expect(span.p).to.equal(firstExitInClient.s),
      span => expect(span.data.http.url).to.equal(serverEndpoint),
      span => expect(span.data.http.host).to.equal(`localhost:${serverControls.getPort()}`),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.status).to.equal(serverEndpoint === '/does-not-exist' ? 404 : 200)
    ]);
    expect(spans).to.have.lengthOf(4);
  }
};
