'use strict';

var expect = require('chai').expect;
var semver = require('semver');
var constants = require('@instana/core').tracing.constants;
var supportedVersion = require('@instana/core').tracing.supportedVersion;

var config = require('../../../collector/test/config');
var utils = require('../../../collector/test/utils');

var agentControls;
var ClientControls;
var ServerControls;

describe('legacy sensor/tracing', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../../collector/test/apps/agentStubControls');
  ClientControls = require('./clientControls');
  ServerControls = require('./serverControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks();

  var serverControls = new ServerControls({
    agentControls: agentControls
  });
  serverControls.registerTestHooks();

  var clientControls = new ClientControls({
    agentControls: agentControls,
    env: {
      SERVER_PORT: serverControls.port
    }
  });
  clientControls.registerTestHooks();

  it('must trace request(<string>, options, cb)', function() {
    if (semver.lt(process.versions.node, '10.9.0')) {
      // The (url, options[, callback]) API only exists since Node 10.9.0:
      return;
    }

    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-url-and-options'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var clientSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-url-opts/);
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-url-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          });
        });
      });
  });

  it('must trace request(<string>, cb)', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-url-only'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var clientSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-url/);
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-only-url/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          });
        });
      });
  });

  it('must trace request(options, cb)', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-options-only'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var clientSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          });
        });
      });
  });

  it('must capture sync exceptions', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-malformed-url'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-malformed-url/);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.url).to.match(/ha-te-te-peh/);
              expect(span.data.http.error).to.match(/Protocol .* not supported./);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });
          });
        });
      });
  });

  it('must trace request(options, cb) with { headers: null }', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-options-only-null-headers'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var clientSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          });
        });
      });
  });

  it('must trace get(<string>, options, cb)', function() {
    if (semver.lt(process.versions.node, '10.9.0')) {
      // The (url, options[, callback]) API only exists since Node 10.9.0.
      return;
    }
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/get-url-and-options'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var clientSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/get-url-opts/);
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/get-url-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          });
        });
      });
  });

  it('must trace get(<string>, cb)', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/get-url-only'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var clientSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/get-only-url/);
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/get-only-url/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          });
        });
      });
  });

  it('must trace get(options, cb)', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/get-options-only'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var clientSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/get-only-opts/);
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/get-only-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          });
        });
      });
  });

  it('must trace calls that fail due to connection refusal', function() {
    return serverControls
      .kill()
      .then(function() {
        return clientControls.sendRequest({
          method: 'GET',
          path: '/timeout',
          simple: false
        });
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/ECONNREFUSED/);
            });
          });
        });
      });
  });

  it('must trace calls that fail due to timeouts', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/timeout',
        simple: false
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/Timeout/);
            });
          });
        });
      });
  });

  it('must trace aborted calls', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/abort',
        simple: false
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/aborted/);
            });
          });
        });
      });
  });
});
