'use strict';

const { expect, fail } = require('chai');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');
const ProcessControls = require('../../ProcessControls');

describe('tracing/logger/express-winston', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());
  const agentControls = require('../../../apps/agentStubControls');
  agentControls.registerTestHooks();
  const controls = new ProcessControls({
    dirname: __dirname,
    agentControls
  }).registerTestHooks();

  it('should not trace HTTP 200/info', () =>
    controls
      .sendRequest({
        path: '/200'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
            const winstonSpans = utils.getSpansByName(spans, 'log.winston');
            expect(winstonSpans).to.be.empty;
          })
        )
      ));

  it('should trace HTTP 400/warn', () =>
    controls
      .sendRequest({
        path: '/400',
        simple: false
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
            utils.expectOneMatching(spans, span => {
              checkWinstonSpan(span, entrySpan, false, 'HTTP GET /400');
            });
          })
        )
      ));

  it('should trace HTTP 500/warn as an error', () =>
    controls
      .sendRequest({
        path: '/500',
        simple: false
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
            utils.expectOneMatching(spans, span => {
              checkWinstonSpan(span, entrySpan, true, 'HTTP GET /500');
            });
          })
        )
      ));

  function checkWinstonSpan(span, parent, erroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('log.winston');
    expect(span.async).to.equal(false);
    expect(span.error).to.equal(erroneous);
    expect(span.ec).to.equal(erroneous ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.log).to.exist;
    expect(span.data.log.message).to.equal(message);
    verifyStackTrace(span);
  }

  function verifyStackTrace(span) {
    expect(span.stack).to.be.an('array');
    expect(span.stack).to.not.be.empty;
    let found = false;
    span.stack.forEach(callSite => {
      found = found || callSite.c.indexOf('express-winston/app.js') >= 0;
    });
    if (!found) {
      fail('Did not find the expected call site express-winston/app.js in ' + JSON.stringify(span.stack, null, 2));
    }
  }
});
