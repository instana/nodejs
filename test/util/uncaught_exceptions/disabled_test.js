'use strict';

var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;
var Promise = require('bluebird');

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var config = require('../../config');
var utils = require('../../utils');

describe('uncaught exception reporting disabled', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentControls = require('../../apps/agentStubControls');
  var ServerControls = require('./apps/serverControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var serverControls = new ServerControls({
    agentControls: agentControls
  });
  serverControls.registerTestHooks();

  it('will not finish the current span', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
      })
      .catch(function(err) {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');

        return Promise.delay(1000).then(function() {
          return utils.retry(function() {
            return agentControls.getSpans().then(function(spans) {
              expect(spans).to.have.lengthOf(0);
            });
          });
        });
      });
  });

  it('must not report the uncaught exception as an issue', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
      })
      .catch(function(err) {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');
        return Promise.delay(1000).then(function() {
          return utils.retry(function() {
            return agentControls.getEvents().then(function(events) {
              expect(events).to.have.lengthOf(0);
            });
          });
        });
      });
  });
});
