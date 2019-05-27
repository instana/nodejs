'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const constants = require('@instana/core').tracing.constants;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/https server', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());

  const agentControls = require('../../../apps/agentStubControls');
  const controls = require('../../../apps/expressControls');

  agentControls.registerTestHooks();
  controls.registerTestHooks({
    useHttps: true
  });

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(controls.getPid()));

  it('must trace incoming HTTPS calls', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201,
        useHttps: true
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.equal(1);

            const span = spans[0];
            expect(span.n).to.equal('node.http.server');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.ec).to.equal(0);
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/checkout');
            expect(span.data.http.status).to.equal(201);
            expect(span.data.http.host).to.equal('127.0.0.1:3211');
          })
        )
      ));

  it('must continue incoming trace', () =>
    controls
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
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.equal(1);

            const span = spans[0];
            expect(span.t).to.equal('84e588b697868fee');
            expect(span.p).to.equal('5e734f51bce69eca');
          })
        )
      ));

  it('must continue incoming trace with 128bit traceIds', () =>
    controls
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
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.equal(1);

            const span = spans[0];
            expect(span.t).to.equal('6636f38f0f3dd0996636f38f0f3dd099');
            expect(span.p).to.equal('fb2bb293ac206c05');
          })
        )
      ));
});
