'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../config');
const utils = require('../../utils');

let agentControls;
let Controls;

describe('tracing/preInit', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../apps/agentStubControls');
  Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  describe('without preInit', function() {
    registerTests.call(this, false);
  });

  describe('with preInit', function() {
    registerTests.call(this, true);
  });
});

function registerTests(usePreInit) {
  const controls = new Controls({
    agentControls,
    usePreInit
  });
  controls.registerTestHooks();

  it(`must ${usePreInit ? '' : 'not'} init instrumentations early and ${
    usePreInit ? '' : 'not'
  } capture log exits`, () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/'
      })
      .then(() => verify()));

  function verify() {
    return utils.retry(() =>
      agentControls.getSpans().then(spans => {
        if (usePreInit) {
          expect(spans.length).to.equal(2);
        } else {
          expect(spans.length).to.equal(1);
        }

        const httpEntry = utils.expectOneMatching(spans, span => {
          expect(span.n).to.equal('node.http.server');
          expect(span.k).to.equal(constants.ENTRY);
          expect(span.p).to.not.exist;
          expect(span.data.http.method).to.equal('GET');
          expect(span.data.http.url).to.equal('/');
        });

        if (usePreInit) {
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('log.pino');
            expect(span.k).to.equal(constants.EXIT);
            expect(span.p).to.equal(httpEntry.s);
            expect(span.data.log.message).to.equal('Should be traced if INSTANA_EARLY_INSTRUMENTATION has been set.');
          });
        }
      })
    );
  }
}
