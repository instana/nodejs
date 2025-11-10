/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const { expectExactlyOneMatching, getSpansByName, retry } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

/**
 * @grpc/grpc-js 1.10 is no longer compatible with mali server
 *   - https://github.com/malijs/mali/issues/376
 *   - mali seems unmaintained. no release since > 2y
 *   - we removed the test cases for now
 */
['latest', 'v1.9.4'].forEach(version => {
  mochaSuiteFn(`tracing/grpc-js@${version}`, function () {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();

    describe('success', function () {
      let serverControls;
      let clientControls;

      before(async function () {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'server'),
          useGlobalAgent: true,
          env: {
            INSTANA_GRPC_VERSION: version
          }
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            INSTANA_GRPC_VERSION: version
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await serverControls.stop();
        await clientControls.stop();
      });

      afterEach(async () => {
        await serverControls.clearIpcMessages();
        await clientControls.clearIpcMessages();
      });

      it('must trace an unary call', () => {
        const expectedReply = 'received: request';
        return runTest('/unary-call', serverControls, clientControls, expectedReply);
      });

      it('must mark unary call as erroneous', () =>
        runTest('/unary-call', serverControls, clientControls, null, false, true));

      it('must cancel an unary call', () => runTest('/unary-call', serverControls, clientControls, null, true, false));

      it('must trace server-side streaming', () => {
        const expectedReply = ['received: request', 'streaming', 'more', 'data'];
        return runTest('/server-stream', serverControls, clientControls, expectedReply);
      });

      it('must mark server-side streaming as erroneous', () =>
        runTest('/server-stream', serverControls, clientControls, null, false, true));

      it('must cancel server-side streaming', () =>
        runTest('/server-stream', serverControls, clientControls, null, true, false));

      it('must trace client-side streaming', () => {
        const expectedReply = 'first; second; third';
        return runTest('/client-stream', serverControls, clientControls, expectedReply);
      });

      it('must mark client-side streaming as erroneous', () =>
        runTest('/client-stream', serverControls, clientControls, null, false, true));

      it('must cancel client-side streaming', () =>
        runTest('/client-stream', serverControls, clientControls, null, true, false));

      it('must trace bidi streaming', () => {
        const expectedReply = ['received: first', 'received: second', 'received: third', 'STOP'];
        return runTest('/bidi-stream', serverControls, clientControls, expectedReply);
      });

      it('must mark bidi streaming as erroneous', () =>
        runTest('/bidi-stream', serverControls, clientControls, null, false, true));

      it('must cancel bidi streaming', () =>
        runTest('/bidi-stream', serverControls, clientControls, null, true, false));
    });

    describe('suppressed', function () {
      let serverControls;
      let clientControls;

      before(async function () {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'server'),
          useGlobalAgent: true,
          env: {
            INSTANA_GRPC_VERSION: version
          }
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            INSTANA_GRPC_VERSION: version
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await serverControls.stop();
        await clientControls.stop();
      });

      afterEach(async () => {
        await serverControls.clearIpcMessages();
        await clientControls.clearIpcMessages();
      });

      it('[suppressed] should not trace', () =>
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
            return delay(1000);
          })
          .then(() =>
            agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0);
            })
          ));
    });

    describe('individually disabled', function () {
      let serverControls;
      let clientControls;

      before(async function () {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'server'),
          useGlobalAgent: true,
          env: {
            INSTANA_TRACING_DISABLE: 'grpcjs',
            INSTANA_GRPC_VERSION: version
          }
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            INSTANA_TRACING_DISABLE: 'grpcjs',
            INSTANA_GRPC_VERSION: version
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await serverControls.stop();
        await clientControls.stop();
      });

      afterEach(async () => {
        await serverControls.clearIpcMessages();
        await clientControls.clearIpcMessages();
      });

      it('should not trace when GRPC tracing is individually disabled', () =>
        clientControls
          .sendRequest({
            method: 'POST',
            path: '/unary-call'
          })
          .then(response => {
            expect(response.reply).to.equal('received: request');
            return delay(500);
          })
          .then(() => {
            return retry(() =>
              agentControls.getSpans().then(spans => {
                expectExactlyOneMatching(spans, checkHttpEntry({ url: '/unary-call' }));
                expect(getSpansByName(spans, 'rpc-client')).to.be.empty;
                expect(getSpansByName(spans, 'rpc-server')).to.be.empty;
              })
            );
          }));
    });

    describe('multiple hosts', function () {
      let serverControls;
      let clientControls;

      before(async function () {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'server'),
          useGlobalAgent: true,
          env: {
            INSTANA_GRPC_VERSION: version
          }
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'client'),
          useGlobalAgent: true,
          env: {
            INSTANA_GRPC_VERSION: version
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await serverControls.stop();
        await clientControls.stop();
      });

      afterEach(async () => {
        await serverControls.clearIpcMessages();
        await clientControls.clearIpcMessages();
      });

      it('call two different hosts', async () => {
        const url = '/two-different-hosts';
        const response = await clientControls.sendRequest({
          method: 'POST',
          path: url
        });

        expect(response.reply1).to.equal('received: request');
        expect(response.reply2).to.equal('received: request');

        let spans;
        await retry(async () => {
          spans = await agentControls.getSpans();
          expect(spans.length).to.eql(7);
        });
        const httpEntry = expectExactlyOneMatching(spans, checkHttpEntry({ url }));
        expectExactlyOneMatching(spans, checkGrpcClientSpan({ httpEntry, clientControls, url, host: 'localhost' }));
        expectExactlyOneMatching(spans, checkGrpcClientSpan({ httpEntry, clientControls, url, host: '127.0.0.1' }));
      });
    });
  });
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
  return retry(async () => {
    const spans = await agentControls.getSpans();

    // For an unary call and client side streaming, we cancel the call immediately on the client, so it usually never
    // reaches the server (depends on the timing), thus we expect less spans to be produced. For server side streaming
    // and bidi streaming we have a communcation channel from the server to the client so that the server can signal to
    // the client when to cancel the call after it has already reached the server, thus we expect more
    // spans (exactly 5). Such a channel does not exist for unary call and client side streaming. This is also checked
    // in more detail in checkTrace.
    if (cancel && (url === '/unary-call' || url === '/client-stream')) {
      // Cancelling the incoming HTTP2 entry span does not reliably work when the GRPC call is cancelled quickly on the
      // client side, because the grpc-js server instrumentation might never be triggered. In that case we end up with
      // an HTTP entry span from the connection attempt made by the grpc-js client before the call has been cancelled.
      // That is why we sometimes get 4 instead of 3 spans. In other cases, the call gets processed on the server side
      // before it is cancelled, in that case we get an rpc-server and an additional log.pino span from processing the
      // call on the server side (which amounts to 5 spans then).
      expect(spans).to.have.lengthOf.at.least(3);
      expect(spans).to.have.lengthOf.at.most(5);
    } else {
      expect(spans).to.have.lengthOf(5);
    }

    checkTrace(serverControls, clientControls, spans, url, cancel, erroneous);
  });
}

function checkTrace(serverControls, clientControls, spans, url, cancel, erroneous) {
  const httpEntry = expectExactlyOneMatching(spans, checkHttpEntry({ url }));
  const grpcExit = expectExactlyOneMatching(spans, checkGrpcClientSpan({ httpEntry, clientControls, url, erroneous }));

  // For an unary call and client side streaming, we cancel the call immediately on the client, so it usually never
  // reaches the server (depends on the timing). Therefore we also do not expect any GRPC server spans to exist. For
  // server side streaming and bidi streaming we have a communcation channel from the server to the client so that the
  // server can signal to the client when to cancel the call after it has already reached the server, such a channel
  // does not exist for unary call and client side streaming.
  if (!cancel || url === '/server-stream' || url === '/bidi-stream') {
    const grpcEntry = expectExactlyOneMatching(
      spans,
      checkGrpcServerSpan({ grpcExit, serverControls, url, erroneous })
    );

    expectExactlyOneMatching(spans, checkLogSpanDuringGrpcEntry({ grpcEntry, url, erroneous }));
  } else {
    // Would be nice to also check for the log span from the interceptor but will actually never be created because at
    // that time, the parent span is an exit span (the GRPC exit). If only log spans were intermediate spans :-)
    // expectExactlyOneMatching(spans, checkLogSpanFromClientInterceptor.bind(null, httpEntry));
    expectExactlyOneMatching(spans, checkLogSpanAfterGrpcExit({ httpEntry, url, cancel, erroneous }));
  }
}

function checkHttpEntry({ url }) {
  return [
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.data.http.url).to.equal(url)
  ];
}

function checkGrpcClientSpan({ httpEntry, clientControls, url, erroneous = false, host = 'localhost' }) {
  let expectations = [
    span => expect(span.n).to.equal('rpc-client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(httpEntry.t),
    span => expect(span.p).to.equal(httpEntry.s),
    span => expect(span.s).to.be.not.empty,
    span => expect(span.f.e).to.equal(String(clientControls.getPid())),
    span => expect(span.data.rpc).to.exist,
    span => expect(span.data.rpc.flavor).to.equal('grpc'),
    span => expect(span.data.rpc.call).to.equal(rpcCallNameForUrl(url)),
    span => expect(span.data.rpc.host).to.equal(host),
    span => expect(span.data.rpc.port).to.equal('50051')
  ];
  if (erroneous) {
    expectations = expectations.concat([
      span => expect(span.ec).to.be.equal(1),
      span => expect(span.error).to.not.exist,
      span => expect(span.data.rpc.error).to.equal('Boom!')
    ]);
  } else {
    expectations = expectations.concat([
      span => expect(span.ec).to.be.equal(0),
      span => expect(span.error).to.not.exist,
      span => expect(span.data.rpc.error).to.not.exist
    ]);
  }
  return expectations;
}

function checkGrpcServerSpan({ grpcExit, serverControls, url, erroneous }) {
  let expectations = [
    span => expect(span.n).to.equal('rpc-server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.t).to.equal(grpcExit.t),
    span => expect(span.p).to.equal(grpcExit.s),
    span => expect(span.s).to.be.not.empty,
    span => expect(span.f.e).to.equal(String(serverControls.getPid())),
    span => expect(span.data.rpc).to.exist,
    span => expect(span.data.rpc.flavor).to.equal('grpc'),
    span => expect(span.data.rpc.call).to.equal(rpcCallNameForUrl(url))
  ];
  if (erroneous) {
    expectations = expectations.concat([
      span => expect(span.ec).to.be.equal(1),
      span => expect(span.error).to.not.exist,
      span => expect(span.data.rpc.error).to.equal('Boom!')
    ]);
  } else {
    expectations = expectations.concat([
      span => expect(span.ec).to.be.equal(0),
      span => expect(span.error).to.not.exist,
      span => expect(span.data.rpc.error).to.not.exist
    ]);
  }
  return expectations;
}

function checkLogSpanAfterGrpcExit({ httpEntry, url, cancel, erroneous }) {
  const expectations = [
    span => expect(span.n).to.equal('log.pino'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(httpEntry.t),
    span => expect(span.p).to.equal(httpEntry.s)
  ];
  if (erroneous) {
    expectations.push(span => expect(span.data.log.message).to.contain('Boom!'));
  } else if (cancel && url !== '/bidi-stream') {
    expectations.push(span => expect(span.data.log.message).to.contain('Cancelled'));
  } else {
    expectations.push(span => expect(span.data.log.message).to.equal(url));
  }
  return expectations;
}

function checkLogSpanDuringGrpcEntry({ grpcEntry, url, erroneous }) {
  const expectations = [
    span => expect(span.n).to.equal('log.pino'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(grpcEntry.t),
    span => expect(span.p).to.equal(grpcEntry.s)
  ];
  if (erroneous) {
    expectations.push(span => expect(span.data.log.message).to.contain('Boom!'));
  } else {
    expectations.push(span => expect(span.data.log.message).to.equal(url));
  }
  return expectations;
}

function rpcCallNameForUrl(url) {
  switch (url) {
    case '/unary-call':
    // fall through
    case '/two-different-hosts':
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
