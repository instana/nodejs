'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var config = require('../../config');
var utils = require('../../utils');

describe('tracing/opentracing/integration', function() {
  var agentStubControls = require('../../apps/agentStubControls');
  var expressOpentracingControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();

  describe('with automatic tracing', function() {
    expressOpentracingControls.registerTestHooks();

    beforeEach(function() {
      return agentStubControls.waitUntilAppIsCompletelyInitialized(expressOpentracingControls.getPid());
    });

    it('must not generate opentracing traces when OT is not used', function() {
      return expressOpentracingControls.sendRequest({ path: '/' }).then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            if (supportedVersion(process.versions.node)) {
              expect(spans).to.have.lengthOf(1);
              expect(spans[0].n).to.equal('node.http.server');
            } else {
              expect(spans).to.have.lengthOf(0);
            }
          });
        });
      });
    });

    it('must generate opentracing traces', function() {
      return expressOpentracingControls.sendRequest({ path: '/withOpentracing' }).then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var serviceSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.be.a('string');
              expect(span.s).to.be.a('string');
              expect(span.s).to.equal(span.t);
              expect(span.p).to.equal(undefined);
              expect(span.n).to.equal('sdk');
              expect(span.f.e).to.equal(String(expressOpentracingControls.getPid()));
              expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists');
              expect(span.data.sdk.name).to.equal('service');
              expect(span.data.sdk.type).to.equal('entry');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(serviceSpan.t);
              expect(span.p).to.equal(serviceSpan.s);
              expect(span.s).to.be.a('string');
              expect(span.s).not.to.equal(span.t);
              expect(span.s).not.to.equal(span.p);
              expect(span.n).to.equal('sdk');
              expect(span.f.e).to.equal(String(expressOpentracingControls.getPid()));
              expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists');
              expect(span.data.sdk.name).to.equal('auth');
              expect(span.data.sdk.type).to.equal('local');
            });

            if (supportedVersion(process.versions.node)) {
              expect(spans).to.have.lengthOf(3);
            } else {
              expect(spans).to.have.lengthOf(2);
            }
          });
        });
      });
    });

    if (supportedVersion(process.versions.node)) {
      it('must connect instana trace to opentracing spans', function() {
        return expressOpentracingControls
          .sendRequest({ path: '/withOpentracingConnectedToInstanaTrace' })
          .then(function() {
            return utils.retry(function() {
              return agentStubControls.getSpans().then(function(spans) {
                expect(spans).to.have.lengthOf(2);

                var httpSpan = utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.f.e).to.equal(String(expressOpentracingControls.getPid()));
                });

                utils.expectOneMatching(spans, function(span) {
                  expect(span.t).to.equal(httpSpan.t);
                  expect(span.p).to.equal(httpSpan.s);
                  expect(span.s).to.be.a('string');
                  expect(span.s).not.to.equal(span.t);
                  expect(span.s).not.to.equal(span.p);
                  expect(span.n).to.equal('sdk');
                  expect(span.f.e).to.equal(String(expressOpentracingControls.getPid()));
                  expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists');
                  expect(span.data.sdk.name).to.equal('service');
                });
              });
            });
          });
      });

      it('must contain baggage in instana span context', function() {
        return expressOpentracingControls
          .sendRequest({ path: '/getCurrentlyActiveInstanaSpanContext' })
          .then(function(body) {
            expect(JSON.parse(body).baggage).to.deep.equal({});
          });
      });
    }
  });

  describe('without automatic tracing', function() {
    expressOpentracingControls.registerTestHooks({ disableAutomaticTracing: true });

    beforeEach(function() {
      return agentStubControls.waitUntilAppIsCompletelyInitialized(expressOpentracingControls.getPid());
    });

    it('must only generate opentracing traces', function() {
      return expressOpentracingControls.sendRequest({ path: '/withOpentracing' }).then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var serviceSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.be.a('string');
              expect(span.s).to.be.a('string');
              expect(span.s).to.equal(span.t);
              expect(span.p).to.equal(undefined);
              expect(span.n).to.equal('sdk');
              expect(span.f.e).to.equal(String(expressOpentracingControls.getPid()));
              expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists');
              expect(span.data.sdk.name).to.equal('service');
              expect(span.data.sdk.type).to.equal('entry');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(serviceSpan.t);
              expect(span.p).to.equal(serviceSpan.s);
              expect(span.s).to.be.a('string');
              expect(span.s).not.to.equal(span.t);
              expect(span.s).not.to.equal(span.p);
              expect(span.n).to.equal('sdk');
              expect(span.f.e).to.equal(String(expressOpentracingControls.getPid()));
              expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists');
              expect(span.data.sdk.name).to.equal('auth');
              expect(span.data.sdk.type).to.equal('local');
            });

            expect(spans).to.have.lengthOf(2);
          });
        });
      });
    });
  });
});
