'use strict';

var expect = require('chai').expect;
var leftpad = require('leftpad');

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var config = require('../../config');
var utils = require('../../utils');

var agentControls;
var ClientControls;
var ServerControls;

describe('tracing/httpClient', function() {
  // controls require features that aren't available in early Node.js versions
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../apps/agentStubControls');
  ClientControls = require('./clientControls');
  ServerControls = require('./serverControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks({
    extraHeaders: ['fooBaR']
  });

  describe('http', function() {
    registerTests.call(this, false);
  });

  describe('https', function() {
    registerTests.call(this, true);
  });
});

function registerTests(useHttps) {
  var serverControls = new ServerControls({
    agentControls: agentControls,
    env: {
      USE_HTTPS: useHttps,
      TRACE_CONTEXT_ENABLED: true
    }
  });
  serverControls.registerTestHooks();

  var clientControls = new ClientControls({
    agentControls: agentControls,
    env: {
      SERVER_PORT: serverControls.port,
      USE_HTTPS: useHttps,
      TRACE_CONTEXT_ENABLED: true
    }
  });
  clientControls.registerTestHooks();

  it('must trace calls that fail due to connection refusal', function() {
    return serverControls.kill()
      .then(function() {
        return clientControls.sendRequest({
          method: 'GET',
          path: '/timeout',
          simple: false
        });
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans()
          .then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/ECONNREFUSED/);
            });
          });
        });
      });
  });

  it('must trace calls that fail due to timeouts', function() {
    return clientControls.sendRequest({
      method: 'GET',
      path: '/timeout',
      simple: false
    })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans()
          .then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/Timeout/);
            });
          });
        });
      });
  });

  it('must trace aborted calls', function() {
    return clientControls.sendRequest({
      method: 'GET',
      path: '/abort',
      simple: false
    })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans()
          .then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/aborted/);
            });
          });
        });
      });
  });

  it('must record custom headers', function() {
    return clientControls.sendRequest({
      method: 'GET',
      path: '/'
    })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans()
          .then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.data.http.header.foobar).to.equal('42');
            });
          });
        });
      });
  });

  it('must forward trace context headers', function() {
    return clientControls.sendRequest({
      method: 'GET',
      path: '/',
      headers: {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        tracestate: 'congo=BleGNlZWRzIHRohbCBwbGVhc3VyZS4='
      }
    })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans()
          .then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.p).not.to.equal(undefined);
              expect(span.data.tc.s).to.deep.equal([
                {k: 'in', v: '00-0af7651916cd43dd8448eb211c80319c-' + leftpad(span.s, 16, '0') + '-01'},
                {k: 'congo', v: 'BleGNlZWRzIHRohbCBwbGVhc3VyZS4='}
              ]);
            });
          });
        });
      });
  });
}
