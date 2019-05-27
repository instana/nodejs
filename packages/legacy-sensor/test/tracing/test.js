'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const config = require('../../../collector/test/config');
const utils = require('../../../collector/test/utils');

let agentControls;
let ClientControls;
let ServerControls;

describe('legacy sensor/tracing', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../../collector/test/apps/agentStubControls');
  ClientControls = require('./clientControls');
  ServerControls = require('./serverControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks();

  const serverControls = new ServerControls({
    agentControls
  });
  serverControls.registerTestHooks();

  const clientControls = new ClientControls({
    agentControls,
    env: {
      SERVER_PORT: serverControls.port
    }
  });
  clientControls.registerTestHooks();

  it('must trace request(<string>, options, cb)', () => {
    if (semver.lt(process.versions.node, '10.9.0')) {
      // The (url, options[, callback]) API only exists since Node 10.9.0:
      return;
    }

    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-url-and-options'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-url-opts/);
            });
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-url-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
        )
      );
  });

  it('must trace request(<string>, cb)', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-url-only'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-url/);
            });
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-only-url/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
        )
      ));

  it('must trace request(options, cb)', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-options-only'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
            });
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
        )
      ));

  it('must capture sync exceptions', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-malformed-url'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-malformed-url/);
            });

            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.url).to.match(/ha-te-te-peh/);
              expect(span.data.http.error).to.match(/Protocol .* not supported./);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });

            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });
          })
        )
      ));

  it('must trace request(options, cb) with { headers: null }', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-options-only-null-headers'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
            });
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
        )
      ));

  it('must trace get(<string>, options, cb)', () => {
    if (semver.lt(process.versions.node, '10.9.0')) {
      // The (url, options[, callback]) API only exists since Node 10.9.0.
      return;
    }
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/get-url-and-options'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/get-url-opts/);
            });
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/get-url-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
        )
      );
  });

  it('must trace get(<string>, cb)', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/get-url-only'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/get-only-url/);
            });
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/get-only-url/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
        )
      ));

  it('must trace get(options, cb)', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/get-options-only'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/get-only-opts/);
            });
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/get-only-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
        )
      ));

  it('must trace calls that fail due to connection refusal', () =>
    serverControls
      .kill()
      .then(() =>
        clientControls.sendRequest({
          method: 'GET',
          path: '/timeout',
          simple: false
        })
      )
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/ECONNREFUSED/);
            });
          })
        )
      ));

  it('must trace calls that fail due to timeouts', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/timeout',
        simple: false
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/Timeout/);
            });
          })
        )
      ));

  it('must trace aborted calls', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/abort',
        simple: false
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/aborted/);
            });
          })
        )
      ));
});
