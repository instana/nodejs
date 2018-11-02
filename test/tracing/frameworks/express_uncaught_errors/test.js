'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/express with uncaught errors', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentControls = require('../../../apps/agentStubControls');
  var ExpressUncaughtErrorsControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var expressUncaughtErrorsControls = new ExpressUncaughtErrorsControls({
    agentControls: agentControls
  });
  expressUncaughtErrorsControls.registerTestHooks();

  it('must record result of default express uncaught error function', function() {
    return expressUncaughtErrorsControls
      .sendRequest({
        method: 'GET',
        path: '/defaultErrorHandler',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        expect(response.statusCode).to.equal(500);

        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressUncaughtErrorsControls.getPid()));
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/To be caught by default error handler/);
            });
          });
        });
      });
  });

  it('must record result of custom express uncaught error function', function() {
    return expressUncaughtErrorsControls
      .sendRequest({
        method: 'GET',
        path: '/customErrorHandler',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        expect(response.statusCode).to.equal(400);

        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressUncaughtErrorsControls.getPid()));
              expect(span.error).to.equal(false);
              expect(span.ec).to.equal(0);
              expect(span.data.http.error).to.match(/To be caught by custom error handler/);
            });
          });
        });
      });
  });
});
