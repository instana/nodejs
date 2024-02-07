/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { delay, expectExactlyOneMatching, retry } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const { AgentStubControls } = require('../../../apps/agentStubControls');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/http2', function () {
  this.timeout(config.getTestTimeout() * 2);

  const agentControls = new AgentStubControls().registerHooksForSuite({
    extraHeaders: [
      //
      'X-My-Request-Header',
      'X-My-Response-Header',
      'x-iNsTanA-sErViCe'
    ],
    secretsList: ['remove']
  });

  let serverControls;
  let clientControls;

  before(async () => {
    serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'server'),
      http2: true,
      agentControls
    });
    serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'client'),
      http2: true,
      agentControls,
      forcePortSearching: true,
      env: {
        SERVER_PORT: serverControls.getPort()
      }
    });
    await serverControls.startAndWaitForAgentConnection();
    await clientControls.startAndWaitForAgentConnection();
  });

  after(async () => {
    await serverControls.stop();
    await clientControls.stop();
  });

  afterEach(async () => {
    await serverControls.clearIpcMessages();
    await clientControls.clearIpcMessages();
  });

  [false, true].forEach(withQuery => {
    it(`must trace http2 GET with${withQuery ? '' : 'out'} query`, () =>
      clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/trigger-downstream', withQuery),
          resolveWithFullResponse: true
        })
        .then(res => {
          expect(res).to.be.an('object');
          expect(res.status).to.equal(200);
          const responsePayload = JSON.parse(res.body);
          expect(responsePayload.message).to.equal('Ohai HTTP2!');

          return retry(() =>
            agentControls
              .getSpans()
              .then(spans => verifySpans(spans, 'GET', false, withQuery, serverControls, clientControls))
          );
        }));
  });

  ['POST', 'PUT', 'PATCH', 'DELETE'].forEach(method => {
    it(`must trace http2 ${method}`, () =>
      clientControls
        .sendRequest({
          method,
          path: '/trigger-downstream',
          resolveWithFullResponse: true
        })
        .then(res => {
          expect(res).to.be.an('object');
          expect(res.status).to.equal(200);
          const responsePayload = JSON.parse(res.body);
          expect(responsePayload.message).to.equal('Ohai HTTP2!');

          return retry(() =>
            agentControls
              .getSpans()
              .then(spans => verifySpans(spans, method, false, false, serverControls, clientControls))
          );
        }));
  });

  it('must trace an errorneous http2 request', () =>
    clientControls
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

        return retry(() =>
          agentControls.getSpans().then(spans => verifySpans(spans, 'GET', true, false, serverControls, clientControls))
        );
      }));

  it('must suppress', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/trigger-downstream',
        headers: {
          'X-INSTANA-L': '0'
        }
      })
      .then(() => delay(500))
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(0);
        })
      ));

  it('must suppress when X-INSTANA-L has trailing content', () =>
    clientControls
      .sendRequest({
        method: 'POST',
        path: '/trigger-downstream',
        headers: {
          'X-INSTANA-L': '0trailingcontet'
        }
      })
      .then(() => delay(500))
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(0);
        })
      ));

  it('must start a new trace with correlation ID', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/request',
        headers: {
          'X-INSTANA-T': '84e588b697868fee',
          'X-INSTANA-S': '5e734f51bce69eca',
          'X-INSTANA-L': '1,correlationType=web;correlationId=abcdef0123456789'
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const entryInClient = verifyRootHttpEntry(spans, `localhost:${serverControls.getPort()}`, '/request');
            expect(entryInClient.t).to.be.a('string');
            expect(entryInClient.t).to.have.lengthOf(16);
            expect(entryInClient.t).to.not.equal('84e588b697868fee');
            expect(entryInClient.p).to.not.exist;
            expect(entryInClient.crtp).to.equal('web');
            expect(entryInClient.crid).to.equal('abcdef0123456789');
          })
        )
      ));

  it('must mark entries as synthetic', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/request',
        headers: {
          'X-INSTANA-SYNTHETIC': '1'
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            verifyRootHttpEntry(spans, `localhost:${serverControls.getPort()}`, '/request', 'GET', 200, false, true);
          })
        )
      ));

  it('must use x-service-service', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/request',
        headers: {
          'x-instanA-SERVICE': 'Custom Service'
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const entry = verifyRootHttpEntry(spans, `localhost:${serverControls.getPort()}`, '/request');
            expect(entry.data.service).to.equal('Custom Service');
          })
        )
      ));

  describe('Server-Timing header', () => {
    it('must expose trace id as Server-Timing header', () =>
      serverControls
        .sendRequest({
          method: 'POST',
          path: '/request',
          resolveWithFullResponse: true
        })
        .then(res => {
          expect(res.headers['server-timing']).to.match(/^intid;desc=[a-f0-9]+$/);
        }));

    it('must also expose trace id as Server-Timing header when X-INSTANA-T and -S are incoming', () =>
      serverControls
        .sendRequest({
          method: 'POST',
          path: '/request',
          headers: {
            'X-INSTANA-T': '84e588b697868fee',
            'X-INSTANA-S': '5e734f51bce69eca'
          },
          resolveWithFullResponse: true
        })
        .then(res => {
          expect(res.headers['server-timing']).to.equal('intid;desc=84e588b697868fee');
        }));

    it('must expose trace id as Server-Timing header: Custom server-timing string', () =>
      serverControls
        .sendRequest({
          method: 'POST',
          path: '/request?server-timing-string=true',
          resolveWithFullResponse: true
        })
        .then(res => {
          expect(res.headers['server-timing']).to.match(/^myServerTimingKey, intid;desc=[a-f0-9]+$/);
        }));

    it('must expose trace id as Server-Timing header: Custom server-timing array', () =>
      serverControls
        .sendRequest({
          method: 'POST',
          path: '/request?server-timing-array=true',
          resolveWithFullResponse: true
        })
        .then(res => {
          expect(res.headers['server-timing']).to.match(/^key1, key2;dur=42, intid;desc=[a-f0-9]+$/);
        }));

    it(
      'must not append another key-value pair when the (string) Server-Timing header already has intid: ' +
        'Custom server-timing string',
      () =>
        serverControls
          .sendRequest({
            method: 'POST',
            path: '/request?server-timing-string-with-intid=true',
            resolveWithFullResponse: true
          })
          .then(res => {
            expect(res.headers['server-timing']).to.equal('myServerTimingKey, intid;desc=1234567890abcdef');
          })
    );

    it(
      'must not append another key-value pair when the (array) Server-Timing header already has intid: ' +
        'Custom server-timing string',
      () =>
        serverControls
          .sendRequest({
            method: 'POST',
            path: '/request?server-timing-array-with-intid=true',
            resolveWithFullResponse: true
          })
          .then(res => {
            expect(res.headers['server-timing']).to.equal('key1, key2;dur=42, intid;desc=1234567890abcdef');
          })
    );
  });

  it('must expose trace ID on incoming HTTP request', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/inject-trace-id',
        resolveWithFullResponse: true
      })
      .then(response => {
        expect(response.body).to.match(/^Instana Trace ID: [a-f0-9]{16}$/);
        const traceId = /^Instana Trace ID: ([a-f0-9]{16})$/.exec(response.body)[1];
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyRootHttpEntry(spans, `localhost:${serverControls.getPort()}`, '/inject-trace-id');
            expect(span.t).to.equal(traceId);
          })
        );
      }));
});

function constructPath(basePath, withQuery) {
  if (withQuery) {
    return `${basePath}?withQuery=true`;
  } else {
    return basePath;
  }
}

function verifySpans(spans, method, erroneous, withQuery, serverControls, clientControls) {
  const entryInClient = verifyRootHttpEntry(
    spans,
    `localhost:${clientControls.getPort()}`,
    '/trigger-downstream',
    method,
    erroneous ? 500 : 200,
    erroneous
  );
  const exitInClient = verifyHttpExit(
    spans,
    entryInClient,
    `https://localhost:${serverControls.getPort()}/request`,
    method,
    true, // expectHeaders
    erroneous ? 500 : 200,
    erroneous
  );
  checkQuery(exitInClient, withQuery, erroneous);
  const entryInServer = verifyHttpEntry(
    spans,
    exitInClient,
    `localhost:${serverControls.getPort()}`,
    '/request',
    method,
    true, // expectHeaders
    erroneous ? 500 : 200,
    erroneous
  );
  checkQuery(entryInServer, withQuery, erroneous);
  expect(spans).to.have.lengthOf(3);
}

function verifyRootHttpEntry(spans, host, url, method = 'GET', status = 200, erroneous = false, synthetic = false) {
  return verifyHttpEntry(spans, null, host, url, method, false, status, erroneous, synthetic);
}

function verifyHttpEntry(
  spans,
  parent,
  host,
  url,
  method = 'GET',
  expectHeaders = true,
  status = 200,
  erroneous = false,
  synthetic = false
) {
  let expectations = [
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.stack).to.have.lengthOf(0),
    span => expect(span.data.http.url).to.equal(url),
    span => expect(span.data.http.method).to.equal(method),
    span => expect(span.data.http.host).to.equal(host),
    span => expect(span.data.http.status).to.equal(status)
  ];

  if (parent) {
    expectations = expectations.concat([
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.s).to.be.a('string'),
      span => expect(span.p).to.equal(parent.s)
    ]);
  } else {
    expectations = expectations.concat([
      span => expect(span.t).to.be.a('string'),
      span => expect(span.s).to.be.a('string'),
      span => expect(span.p).to.not.exist
    ]);
  }
  if (!synthetic) {
    expectations.push(span => expect(span.sy).to.not.exist);
  } else {
    expectations.push(span => expect(span.sy).to.be.true);
  }
  if (erroneous) {
    expectations.push(span => expect(span.ec).to.equal(1));
  } else {
    expectations.push(span => expect(span.ec).to.equal(0));
  }
  if (expectHeaders) {
    expectations = expectations.concat([
      span => expect(span.data.http.header).to.exist,
      span => expect(span.data.http.header['x-my-request-header']).to.equal('x-my-request-header-value'),
      span => expect(span.data.http.header['x-my-response-header']).to.equal('x-my-response-header-value')
    ]);
  }
  return expectExactlyOneMatching(spans, expectations);
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
  let expectations = [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(parent.t),
    span => expect(span.p).to.equal(parent.s),
    span => expect(span.s).to.be.a('string'),
    span => expect(span.stack).to.be.an('array'),
    span => expect(span.stack).to.have.lengthOf.at.least(2),
    span => expect(span.stack[0].c).to.contain('packages/collector/test/test_util/http2Promise.js'),
    span => expect(span.data.http.url).to.equal(url),
    span => expect(span.data.http.method).to.equal(method),
    span => expect(span.data.http.status).to.equal(status)
  ];
  if (erroneous) {
    expectations.push(span => expect(span.ec).to.equal(1));
  } else {
    expectations.push(span => expect(span.ec).to.equal(0));
  }
  if (!synthetic) {
    expectations.push(span => expect(span.sy).to.not.exist);
  } else {
    expectations.push(span => expect(span.sy).to.be.true);
  }
  if (expectHeaders) {
    expectations = expectations.concat([
      span => expect(span.data.http.header).to.exist,
      span => expect(span.data.http.header['x-my-request-header']).to.equal('x-my-request-header-value'),
      span => expect(span.data.http.header['x-my-response-header']).to.equal('x-my-response-header-value')
    ]);
  }

  return expectExactlyOneMatching(spans, expectations);
}

function checkQuery(span, withQuery, erroneous) {
  if (withQuery) {
    expect(span.data.http.params).to.equal('q1=some&q2=value&rEmoVeThis=<redacted>');
  } else if (erroneous) {
    expect(span.data.http.params).to.equal('error=true');
  } else {
    expect(span.data.http.params).to.not.exist;
  }
}
