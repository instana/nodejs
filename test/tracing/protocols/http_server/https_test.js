'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/https', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var agentStubControls = require('../../../apps/agentStubControls');
  var expressControls = require('../../../apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    useHttps: true
  });

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  it('must trace incoming HTTPS calls', function() {
    return expressControls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201,
        useHttps: true
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            expect(spans.length).to.equal(1);

            var span = spans[0];
            expect(span.n).to.equal('node.http.server');
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.ec).to.equal(0);
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/checkout');
            expect(span.data.http.status).to.equal(201);
            expect(span.data.http.host).to.equal('127.0.0.1:3211');
          });
        });
      });
  });

  it('must continue incoming trace', function() {
    return expressControls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201,
        useHttps: true,
        headers: {
          'X-INSTANA-T': '84e588b697868fee',
          'X-INSTANA-S': '5e734f51bce69eca',
          'X-INSTANA-L': '1'
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            expect(spans.length).to.equal(1);

            var span = spans[0];
            expect(span.t).to.equal('84e588b697868fee');
            expect(span.p).to.equal('5e734f51bce69eca');
          });
        });
      });
  });
  it('must continue incoming trace with 128bit traceIds', function() {
    return expressControls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201,
        useHttps: true,
        headers: {
          'X-INSTANA-T': '6636f38f0f3dd0996636f38f0f3dd099',
          'X-INSTANA-S': 'fb2bb293ac206c05',
          'X-INSTANA-L': '1'
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            expect(spans.length).to.equal(1);

            var span = spans[0];
            expect(span.t).to.equal('6636f38f0f3dd0996636f38f0f3dd099');
            expect(span.p).to.equal('fb2bb293ac206c05');
          });
        });
      });
  });
});
