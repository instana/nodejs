'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

let agentControls;
let Controls;

describe('tracing/http(s) server', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');
  Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks({
    extraHeaders: [
      //
      'X-My-Fancy-Request-Header',
      'X-My-Fancy-Response-Header',
      'X-Write-Head-Response-Header'
    ],
    secretsList: ['secret', 'Enigma', 'CIPHER']
  });

  describe('http', function() {
    registerTests.call(this, false);
  });

  describe('https', function() {
    registerTests.call(this, true);
  });
});

function registerTests(useHttps) {
  const controls = new Controls({
    agentControls
  });
  controls.registerTestHooks({
    useHttps
  });

  it(`must capture incoming calls and start a new trace (HTTPS: ${useHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        qs: {
          responseStatus: 201
        }
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
            expect(span.t).to.be.a('string');
            expect(span.s).to.be.a('string');
            expect(span.p).to.not.exist;
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/checkout');
            expect(span.data.http.status).to.equal(201);
            expect(span.data.http.host).to.equal('127.0.0.1:3215');
          })
        )
      ));

  it(`must continue incoming trace (HTTPS: ${useHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201,
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
            expect(span.s).to.be.a('string');
          })
        )
      ));

  it(`must continue incoming trace with 128bit traceIds (HTTPS: ${useHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201,
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

  it(`must capture configured request headers when present (HTTPS: ${useHttps})`, () => {
    const requestHeaderValue = 'Request Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/',
        headers: {
          'X-MY-FANCY-REQUEST-HEADER': requestHeaderValue
        }
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.header).to.be.an('object');
              expect(span.data.http.header['x-my-fancy-request-header']).to.equal(requestHeaderValue);
              expect(Object.keys(span.data.http.header)).to.have.lengthOf(1);
            });
          })
        )
      );
  });

  it(`must capture configured response headers when present (HTTPS: ${useHttps})`, () => {
    const expectedResponeHeaderValue = 'Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?responseHeader=true'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.header).to.be.an('object');
              expect(span.data.http.header['x-my-fancy-response-header']).to.equal(expectedResponeHeaderValue);
              expect(Object.keys(span.data.http.header)).to.have.lengthOf(1);
            });
          })
        )
      );
  });

  it(`must capture response headers written directly to the response (HTTPS: ${useHttps})`, () => {
    const expectedResponeHeaderValue = 'Write Head Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?writeHead=true'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.header).to.be.an('object');
              expect(span.data.http.header['x-write-head-response-header']).to.equal(expectedResponeHeaderValue);
              expect(Object.keys(span.data.http.header)).to.have.lengthOf(1);
            });
          })
        )
      );
  });

  it(`must capture configured request and response headers when present (HTTPS: ${useHttps})`, () => {
    const requestHeaderValue = 'Request Header Value';
    const expectedResponeHeaderValue = 'Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?responseHeader=true',
        headers: {
          'X-MY-FANCY-REQUEST-HEADER': requestHeaderValue
        }
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.header).to.be.an('object');
              expect(span.data.http.header['x-my-fancy-request-header']).to.equal(requestHeaderValue);
              expect(span.data.http.header['x-my-fancy-response-header']).to.equal(expectedResponeHeaderValue);
              expect(Object.keys(span.data.http.header)).to.have.lengthOf(2);
            });
          })
        )
      );
  });

  it(//
  `must capture both response headers written directly to the response and other heaers (HTTPS: ${useHttps})`, () => {
    const requestHeaderValue = 'Request Header Value';
    const expectedResponeHeaderValue1 = 'Write Head Response Header Value';
    const expectedResponeHeaderValue2 = 'Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?responseHeader=true&writeHead=true',
        headers: {
          'X-MY-FANCY-REQUEST-HEADER': requestHeaderValue
        }
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.header).to.be.an('object');
              expect(span.data.http.header['x-my-fancy-request-header']).to.equal(requestHeaderValue);
              expect(span.data.http.header['x-write-head-response-header']).to.equal(expectedResponeHeaderValue1);
              expect(span.data.http.header['x-my-fancy-response-header']).to.equal(expectedResponeHeaderValue2);
              expect(Object.keys(span.data.http.header)).to.have.lengthOf(3);
            });
          })
        )
      );
  });

  it(//
  `must not contain the header field when neither request nor response headers arepresent (HTTPS: ${useHttps})`, () => {
    return controls
      .sendRequest({
        method: 'GET',
        path: '/'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.header).to.not.exist;
            });
          })
        )
      );
  });

  it(`must remove secrets from query parameters (HTTPS: ${useHttps})`, () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/?param1=value1&TheSecreT=classified&param2=value2&enIgmAtic=occult&param3=value4&cipher=veiled'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.params).to.equal('param1=value1&param2=value2&param3=value4');
            });
          })
        )
      ));
}
