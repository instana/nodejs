/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const expect = require('chai').expect;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('agentStub', function () {
  const { AgentStubControls } = require('./agentStubControls');
  let agentStubControls;

  this.timeout(config.getTestTimeout());

  before(async () => {
    agentStubControls = new AgentStubControls();
    await agentStubControls.startAgent();
  });

  after(async () => {
    await agentStubControls.stopAgent();
  });

  it('must respond without any discoveries upon start', () =>
    agentStubControls.getDiscoveries().then(discoveries => {
      expect(discoveries).to.deep.equal({});
    }));

  it('must return requests when retrieving entity data', () => {
    const pid = 23;
    const params = { foo: 'bar' };
    return agentStubControls
      .simulateDiscovery(pid)
      .then(() => agentStubControls.addRequestForPid(pid, params))
      .then(() => agentStubControls.addEntityData(pid, {}))
      .then(requests => {
        expect(requests).to.deep.equal([params]);
      });
  });
});
