'use strict';

const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const Promise = require('bluebird');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');

describe('uncaught exception reporting disabled', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../apps/agentStubControls');
  const ServerControls = require('./apps/serverControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const serverControls = new ServerControls({
    agentControls
  });
  serverControls.registerTestHooks();

  it('will not finish the current span', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
      })
      .catch(err => {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');

        return Promise.delay(1000).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0);
            })
          )
        );
      }));

  it('must not report the uncaught exception as an issue', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
      })
      .catch(err => {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');
        return Promise.delay(1000).then(() =>
          testUtils.retry(() =>
            agentControls.getEvents().then(events => {
              expect(events).to.have.lengthOf(0);
            })
          )
        );
      }));
});
