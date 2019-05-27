'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/express with uncaught errors', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');
  const ExpressUncaughtErrorsControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const expressUncaughtErrorsControls = new ExpressUncaughtErrorsControls({
    agentControls
  });
  expressUncaughtErrorsControls.registerTestHooks();

  it('must record result of default express uncaught error function', () =>
    expressUncaughtErrorsControls
      .sendRequest({
        method: 'GET',
        path: '/defaultErrorHandler',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        expect(response.statusCode).to.equal(500);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.f.e).to.equal(String(expressUncaughtErrorsControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/To be caught by default error handler/);
            });
          })
        );
      }));

  it('must record result of custom express uncaught error function', () =>
    expressUncaughtErrorsControls
      .sendRequest({
        method: 'GET',
        path: '/customErrorHandler',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        expect(response.statusCode).to.equal(400);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.f.e).to.equal(String(expressUncaughtErrorsControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.equal(false);
              expect(span.ec).to.equal(0);
              expect(span.data.http.error).to.match(/To be caught by custom error handler/);
            });
          })
        );
      }));
});
