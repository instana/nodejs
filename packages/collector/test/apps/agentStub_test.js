/* eslint-env mocha */

'use strict';

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../config');
const expect = require('chai').expect;

describe('agentStub', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentStubControls = require('./agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();

  it('must respond without any discoveries upon start', () =>
    agentStubControls.getDiscoveries().then(discoveries => {
      expect(discoveries).to.deep.equal({});
    }));

  it('must respond without any data upon start', () =>
    agentStubControls.getRetrievedData().then(data => {
      expect(data).to.deep.equal({
        runtime: [],
        traces: [],
        responses: [],
        events: [],
        tracingMetrics: []
      });
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
