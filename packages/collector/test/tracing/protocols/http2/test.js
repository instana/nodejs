'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { expectExactlyOneMatching, retry } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

let agentControls;

const clientPort = 3216;
const serverPort = 3217;

const mochaSuiteFn =
  supportedVersion(process.versions.node) &&
  // HTTP2 support was added in Node.js 8.4.0
  semver.gte(process.versions.node, '8.4.0')
    ? describe
    : describe.skip;

mochaSuiteFn('tracing/http2', function() {
  agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks({
    extraHeaders: [
      //
      'X-My-Request-Header',
      'X-My-Response-Header'
    ],
    secretsList: ['remove']
  });

  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'server'),
    http2: true,
    port: serverPort,
    agentControls
  }).registerTestHooks();

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'client'),
    http2: true,
    port: clientPort,
    agentControls,
    env: {
      SERVER_PORT: serverControls.port
    }
  }).registerTestHooks();

  [false, true].forEach(withQuery => {
    it(`must trace http2 GET with${withQuery ? '' : 'out'} query`, () => {
      return clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/trigger-downstream', withQuery)
        })
        .then(res => {
          expect(res).to.be.an('object');
          expect(res.status).to.equal(200);
          const responsePayload = JSON.parse(res.body);
          expect(responsePayload.message).to.equal('Ohai HTTP2!');

          return retry(() => agentControls.getSpans().then(spans => verifySpans(spans, 'GET', false, withQuery)));
        });
    });
  });

  ['POST', 'PUT', 'PATCH', 'DELETE'].forEach(method => {
    it(`must trace http2 ${method}`, () => {
      return clientControls
        .sendRequest({
          method: method,
          path: '/trigger-downstream'
        })
        .then(res => {
          expect(res).to.be.an('object');
          expect(res.status).to.equal(200);
          const responsePayload = JSON.parse(res.body);
          expect(responsePayload.message).to.equal('Ohai HTTP2!');

          return retry(() => agentControls.getSpans().then(spans => verifySpans(spans, method, false)));
        });
    });
  });

  it('must trace an errorneous http2 request', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/trigger-downstream?error=true',
        simple: false
      })
      .then(res => {
        expect(res).to.be.an('object');
        expect(res.status).to.equal(500);
        const responsePayload = JSON.parse(res.body);
        expect(responsePayload.message).to.equal('Oops!');

        return retry(() => agentControls.getSpans().then(spans => verifySpans(spans, 'GET', true)));
      });
  });
});

function constructPath(basePath, withQuery) {
  if (withQuery) {
    return `${basePath}?withQuery=true`;
  } else {
    return basePath;
  }
}

function verifySpans(spans, method, erroneous, withQuery) {
  const entryInClient = verifyRootHttpEntry(
    spans,
    `localhost:${clientPort}`,
    '/trigger-downstream',
    method,
    erroneous ? 500 : 200,
    erroneous
  );
  const exitInClient = verifyHttpExit(
    spans,
    entryInClient,
    `https://localhost:${serverPort}/request`,
    method,
    true, // expectHeaders
    erroneous ? 500 : 200,
    erroneous
  );
  checkQuery(exitInClient, withQuery, erroneous);
  const entryInServer = verifyHttpEntry(
    spans,
    exitInClient,
    `localhost:${serverPort}`,
    '/request',
    method,
    true, // expectHeaders
    erroneous ? 500 : 200,
    erroneous
  );
  checkQuery(entryInServer, withQuery, erroneous);
  expect(spans).to.have.lengthOf(3);
}

function verifyRootHttpEntry(spans, host, url, method, status, erroneous, synthetic) {
  return verifyHttpEntry(spans, null, host, url, method, false, status, erroneous, synthetic);
}

function verifyHttpEntry(
  spans,
  parent,
  host,
  url,
  method = 'GET',
  expectHeaders,
  status = 200,
  erroneous = false,
  synthetic = false
) {
  return expectExactlyOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.server');
    expect(span.k).to.equal(constants.ENTRY);
    if (parent) {
      expect(span.t).to.equal(parent.t);
      expect(span.s).to.be.a('string');
      expect(span.p).to.equal(parent.s);
    } else {
      expect(span.t).to.be.a('string');
      expect(span.s).to.be.a('string');
      expect(span.p).to.not.exist;
    }
    if (!synthetic) {
      expect(span.sy).to.not.exist;
    } else {
      expect(span.sy).to.be.true;
    }
    if (erroneous) {
      expect(span.ec).to.equal(1);
    } else {
      expect(span.ec).to.equal(0);
    }
    expect(span.stack).to.have.lengthOf(0);
    expect(span.data.http.url).to.equal(url);
    expect(span.data.http.method).to.equal(method);
    expect(span.data.http.host).to.equal(host);
    expect(span.data.http.status).to.equal(status);
    if (expectHeaders) {
      expect(span.data.http.header).to.exist;
      expect(span.data.http.header['x-my-request-header']).to.equal('x-my-request-header-value');
      expect(span.data.http.header['x-my-response-header']).to.equal('x-my-response-header-value');
    }
  });
}

function verifyHttpExit(
  spans,
  parent,
  url,
  method = 'GET',
  expectHeaders = true,
  status = 200,
  erroneous = false,
  synthetic = false
) {
  return expectExactlyOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.client');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.s).to.be.a('string');
    if (erroneous) {
      expect(span.ec).to.equal(1);
    } else {
      expect(span.ec).to.equal(0);
    }
    expect(span.stack).to.be.an('array');
    expect(span.stack).to.have.lengthOf.at.least(2);
    expect(span.stack[0].c).to.contain('packages/collector/test/test_util/http2Promise.js');
    expect(span.data.http.url).to.equal(url);
    expect(span.data.http.method).to.equal(method);
    expect(span.data.http.status).to.equal(status);
    if (!synthetic) {
      expect(span.sy).to.not.exist;
    } else {
      expect(span.sy).to.be.true;
    }
    if (expectHeaders) {
      expect(span.data.http.header).to.exist;
      expect(span.data.http.header['x-my-request-header']).to.equal('x-my-request-header-value');
      expect(span.data.http.header['x-my-response-header']).to.equal('x-my-response-header-value');
    }
  });
}

function checkQuery(span, withQuery, erroneous) {
  if (withQuery) {
    expect(span.data.http.params).to.equal('q1=some&q2=value');
  } else if (erroneous) {
    expect(span.data.http.params).to.equal('error=true');
  } else {
    expect(span.data.http.params).to.not.exist;
  }
}
