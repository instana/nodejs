/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const ProcessControls = require('../../../collector/test/test_util/ProcessControls');

const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');

const serverPort = 3216;

let agentControls;

describe('legacy sensor/tracing', function () {
  if (!supportedVersion(process.versions.node) || (process.env.CI && semver.lt(process.versions.node, '7.0.0'))) {
    return;
  }

  agentControls = require('../../../collector/test/apps/agentStubControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks();

  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'serverApp'),
    port: serverPort,
    agentControls
  }).registerTestHooks();

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'clientApp'),
    agentControls,
    env: {
      SERVER_PORT: serverPort
    }
  }).registerTestHooks();

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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/request-url-opts/)
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/request-url-opts/),
              span => expect(span.t).to.equal(clientSpan.t),
              span => expect(span.p).to.equal(clientSpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/request-only-url/)
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/request-only-url/),
              span => expect(span.t).to.equal(clientSpan.t),
              span => expect(span.p).to.equal(clientSpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/)
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/),
              span => expect(span.t).to.equal(clientSpan.t),
              span => expect(span.p).to.equal(clientSpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/request-malformed-url/)
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.http.url).to.match(/ha-te-te-peh/),
              span => expect(span.data.http.error).to.match(/Protocol .* not supported./),
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s)
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/),
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/)
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/),
              span => expect(span.t).to.equal(clientSpan.t),
              span => expect(span.p).to.equal(clientSpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/get-url-opts/)
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/get-url-opts/),
              span => expect(span.t).to.equal(clientSpan.t),
              span => expect(span.p).to.equal(clientSpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/get-only-url/)
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/get-only-url/),
              span => expect(span.t).to.equal(clientSpan.t),
              span => expect(span.p).to.equal(clientSpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.url).to.match(/\/get-only-opts/)
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.match(/\/get-only-opts/),
              span => expect(span.t).to.equal(clientSpan.t),
              span => expect(span.p).to.equal(clientSpan.s)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.http.error).to.match(/ECONNREFUSED/)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.http.error).to.match(/Timeout/)
            ]);
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.http.error).to.match(/aborted/)
            ]);
          })
        )
      ));
});
