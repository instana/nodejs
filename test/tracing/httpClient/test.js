'use strict';

var expect = require('chai').expect;

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
      USE_HTTPS: useHttps
    }
  });
  serverControls.registerTestHooks();

  var clientControls = new ClientControls({
    agentControls: agentControls,
    env: {
      SERVER_PORT: serverControls.port,
      USE_HTTPS: useHttps
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

  it('must record calls with an "Expect: 100-continue" header', function() {
    return clientControls.sendRequest({
      method: 'put',
      path: '/expect-continue'
    })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans()
          .then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.data.http.method).to.equal('PUT');
              expect(span.data.http.status).to.equal(200);
              expect(span.data.http.url).to.match(/\/continue/);
            });
          });
        });
      });
  });

  // This test is always skipped on CI, it is meant to be only activated for manual execution because it needs three
  // additional environment variables that provide access to an S3 bucket. The env vars that need to be set are:
  // AWS_ACCESS_KEY_ID,
  // AWS_SECRET_ACCESS_KEY and
  // AWS_S3_BUCKET_NAME.
  it.skip('must upload to S3', function() {
    return clientControls.sendRequest({
      method: 'POST',
      path: '/upload-s3'
    });
  });

}
