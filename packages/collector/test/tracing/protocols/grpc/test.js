'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

describe('tracing/grpc', function() {
  if (!semver.satisfies(process.versions.node, '>=8.2.1')) {
    return;
  }

  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  ['dynamic', 'static'].forEach(codeGenMode => {
    [false, true].forEach(withMetadata => {
      [false, true].forEach(function(withOptions) {
        registerSuite.bind(this)(codeGenMode, withMetadata, withOptions);
      });
    });
  });
  // registerSuite.bind(this)('dynamic', false, false);

  describe('suppressed', () => {
    new ProcessControls({
      appPath: path.join(__dirname, 'server'),
      useGlobalAgent: true
    }).registerTestHooks();
    const clientControls = new ProcessControls({
      appPath: path.join(__dirname, 'client'),
      port: 3216,
      useGlobalAgent: true
    }).registerTestHooks();

    it('should not trace when suppressed', () =>
      clientControls
        .sendRequest({
          method: 'POST',
          path: '/unary-call',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
        .then(response => {
          expect(response.reply).to.equal('received: request');
          return delay(config.getTestTimeout() / 4);
        })
        .then(() =>
          agentControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(0);
          })
        ));
  });

  describe('individually disabled', () => {
    new ProcessControls({
      appPath: path.join(__dirname, 'server'),
      useGlobalAgent: true,
      env: {
        INSTANA_DISABLED_TRACERS: 'GRPC'
      }
    }).registerTestHooks();
    const clientControls = new ProcessControls({
      appPath: path.join(__dirname, 'client'),
      port: 3216,
      useGlobalAgent: true,
      env: {
        INSTANA_DISABLED_TRACERS: 'GRPC'
      }
    }).registerTestHooks();

    it('should not trace when GRPC tracing is individually disabled', () =>
      clientControls
        .sendRequest({
          method: 'POST',
          path: '/unary-call'
        })
        .then(response => {
          expect(response.reply).to.equal('received: request');
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, checkHttpEntry.bind(null, '/unary-call'));
              expect(testUtils.getSpansByName(spans, 'rpc-client')).to.be.empty;
              expect(testUtils.getSpansByName(spans, 'rpc-server')).to.be.empty;
            })
          );
        }));
  });
});

function registerSuite(codeGenMode, withMetadata, withOptions) {
  describe(`codegen: ${codeGenMode}, with metadata: ${withMetadata}, with options: ${withOptions}`, () => {
    const env = {};
    if (codeGenMode === 'static') {
      env.GRPC_STATIC = true;
    }
    if (withMetadata) {
      env.GRPC_WITH_METADATA = true;
    }
    if (withOptions) {
      env.GRPC_WITH_OPTIONS = true;
    }
    const serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'server'),
      useGlobalAgent: true,
      env
    }).registerTestHooks();
    const clientControls = new ProcessControls({
      appPath: path.join(__dirname, 'client'),
      port: 3216,
      useGlobalAgent: true,
      env
    }).registerTestHooks();

    it('must trace an unary call', () => {
      const expectedReply = `received: request${withMetadata ? ' & test-content' : ''}`;
      return runTest('/unary-call', serverControls, clientControls, expectedReply);
    });

    it('must cancel an unary call', () => runTest('/unary-call', serverControls, clientControls, null, true, false));

    it('must mark unary call as erroneous', () =>
      runTest('/unary-call', serverControls, clientControls, null, false, true));

    it('must trace server-side streaming', () => {
      const expectedReply = withMetadata
        ? ['received: request & test-content', 'streaming', 'more', 'data']
        : ['received: request', 'streaming', 'more', 'data'];
      return runTest('/server-stream', serverControls, clientControls, expectedReply);
    });

    it('must cancel server-side streaming', () =>
      runTest('/server-stream', serverControls, clientControls, null, true, false));

    it('must mark server-side streaming as erroneous', () =>
      runTest('/server-stream', serverControls, clientControls, null, false, true));

    it('must trace client-side streaming', () => {
      const expectedReply = 'first; second; third';
      return runTest('/client-stream', serverControls, clientControls, expectedReply);
    });

    it('must cancel client-side streaming', () =>
      runTest('/client-stream', serverControls, clientControls, null, true, false));

    it('must mark client-side streaming as erroneous', () =>
      runTest('/client-stream', serverControls, clientControls, null, false, true));

    it('must trace bidi streaming', () => {
      const expectedReply = withMetadata
        ? [
            'received: first & test-content',
            'received: second & test-content',
            'received: third & test-content',
            'STOP'
          ]
        : ['received: first', 'received: second', 'received: third', 'STOP'];
      return runTest('/bidi-stream', serverControls, clientControls, expectedReply);
    });

    it('must cancel bidi streaming', () => runTest('/bidi-stream', serverControls, clientControls, null, true, false));

    it('must mark bidi streaming as erroneous', () =>
      runTest('/bidi-stream', serverControls, clientControls, null, false, true));
  });

  function runTest(url, serverControls, clientControls, expectedReply, cancel, erroneous) {
    return clientControls
      .sendRequest({
        method: 'POST',
        path: url + createQueryParams(cancel, erroneous)
      })
      .then(response => {
        if (!erroneous && !cancel) {
          expect(response.reply).to.deep.equal(expectedReply);
        }
        return waitForTrace(serverControls, clientControls, url, cancel, erroneous);
      });
  }

  function createQueryParams(cancel, erroneous) {
    if (erroneous) {
      return '?error=true';
    } else if (cancel) {
      return '?cancel=true';
    } else {
      return '';
    }
  }

  function waitForTrace(serverControls, clientControls, url, cancel, erroneous) {
    return testUtils.retry(() =>
      agentControls.getSpans().then(spans => {
        checkTrace(serverControls, clientControls, spans, url, cancel, erroneous);
      })
    );
  }

  function checkTrace(serverControls, clientControls, spans, url, cancel, erroneous) {
    const httpEntry = testUtils.expectAtLeastOneMatching(spans, checkHttpEntry.bind(null, url));
    const grpcExit = testUtils.expectAtLeastOneMatching(
      spans,
      checkGrpcClientSpan.bind(null, httpEntry, clientControls, url, cancel, erroneous)
    );
    // Except for server-streaming and bidi-streaming, we cancel the call immediately on the client, so it usually never
    // reaches the server (depends on the timing). Therefore we also do not expect any GRPC server spans to exist. For
    // server-streaming and bidi-streaming we have a communcation channel from the server to the client so that the
    // server can signal to the client when to cancel the call after it has already reached the server, such a channel
    // does not exist for unary call and client side streaming.
    if (!cancel || url === '/server-stream' || url === '/bidi-stream') {
      const grpcEntry = testUtils.expectAtLeastOneMatching(
        spans,
        checkGrpcServerSpan.bind(null, grpcExit, serverControls, url, cancel, erroneous)
      );
      testUtils.expectAtLeastOneMatching(spans, checkLogSpanDuringGrpcEntry.bind(null, grpcEntry, url, erroneous));
    }
    // Would be nice to also check for the log span from the interceptor but will actually never be created because at
    // that time, the parent span is an exit span (the GRPC exit). If only log spans were intermediate spans :-)
    // testUtils.expectAtLeastOneMatching(spans, checkLogSpanFromClientInterceptor.bind(null, httpEntry));
    testUtils.expectAtLeastOneMatching(spans, checkLogSpanAfterGrpcExit.bind(null, httpEntry, url, cancel, erroneous));
  }
}

function checkHttpEntry(url, span) {
  expect(span.n).to.equal('node.http.server');
  expect(span.k).to.equal(constants.ENTRY);
  expect(span.data.http.url).to.equal(url);
}

function checkGrpcClientSpan(httpEntry, clientControls, url, cancel, erroneous, span) {
  expect(span.n).to.equal('rpc-client');
  expect(span.k).to.equal(constants.EXIT);
  expect(span.t).to.equal(httpEntry.t);
  expect(span.p).to.equal(httpEntry.s);
  expect(span.s).to.be.not.empty;
  expect(span.f.e).to.equal(String(clientControls.getPid()));
  expect(span.data.rpc).to.exist;
  expect(span.data.rpc.flavor).to.equal('grpc');
  expect(span.data.rpc.call).to.equal(rpcCallNameForUrl(url));
  expect(span.data.rpc.host).to.equal('localhost');
  expect(span.data.rpc.port).to.equal('50051');
  if (erroneous) {
    expect(span.ec).to.be.equal(1);
    expect(span.error).to.not.exist;
    expect(span.data.rpc.error).to.equal('Boom!');
  } else {
    expect(span.ec).to.be.equal(0);
    expect(span.error).to.not.exist;
    expect(span.data.rpc.error).to.not.exist;
  }
}

function checkGrpcServerSpan(grpcExit, serverControls, url, cancel, erroneous, span) {
  expect(span.n).to.equal('rpc-server');
  expect(span.k).to.equal(constants.ENTRY);
  expect(span.t).to.equal(grpcExit.t);
  expect(span.p).to.equal(grpcExit.s);
  expect(span.s).to.be.not.empty;
  expect(span.f.e).to.equal(String(serverControls.getPid()));
  expect(span.data.rpc).to.exist;
  expect(span.data.rpc.flavor).to.equal('grpc');
  expect(span.data.rpc.call).to.equal(rpcCallNameForUrl(url));
  if (erroneous) {
    expect(span.ec).to.be.equal(1);
    expect(span.error).to.not.exist;
    expect(span.data.rpc.error).to.equal('Boom!');
  } else {
    expect(span.ec).to.be.equal(0);
    expect(span.error).to.not.exist;
    expect(span.data.rpc.error).to.not.exist;
  }
}

function checkLogSpanAfterGrpcExit(httpEntry, url, cancel, erroneous, span) {
  expect(span.n).to.equal('log.pino');
  expect(span.k).to.equal(constants.EXIT);
  expect(span.t).to.equal(httpEntry.t);
  expect(span.p).to.equal(httpEntry.s);
  if (erroneous) {
    expect(span.data.log.message).to.contain('Boom!');
  } else if (cancel && url !== '/bidi-stream') {
    expect(span.data.log.message).to.contain('Cancelled');
  } else {
    expect(span.data.log.message).to.equal(url);
  }
}

function checkLogSpanDuringGrpcEntry(grpcEntry, url, erroneous, span) {
  expect(span.n).to.equal('log.pino');
  expect(span.k).to.equal(constants.EXIT);
  expect(span.t).to.equal(grpcEntry.t);
  expect(span.p).to.equal(grpcEntry.s);
  if (erroneous) {
    expect(span.data.log.message).to.contain('Boom!');
  } else {
    expect(span.data.log.message).to.equal(url);
  }
}

function rpcCallNameForUrl(url) {
  switch (url) {
    case '/unary-call':
      return 'instana.node.grpc.test.TestService/MakeUnaryCall';
    case '/server-stream':
      return 'instana.node.grpc.test.TestService/StartServerSideStreaming';
    case '/client-stream':
      return 'instana.node.grpc.test.TestService/StartClientSideStreaming';
    case '/bidi-stream':
      return 'instana.node.grpc.test.TestService/StartBidiStreaming';
    default:
      throw new Error(`Unknown URL: ${url}`);
  }
}
