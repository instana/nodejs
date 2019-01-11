'use strict';

var expect = require('chai').expect;
var Promise = require('bluebird');

var cls = require('../../../../src/tracing/cls');
var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

var agentControls;
var ClientControls;
var ServerControls;
var serverControls;
var clientControls;

describe('tracing/grpc', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');
  ClientControls = require('./clientControls');
  ServerControls = require('./serverControls');

  this.timeout(config.getTestTimeout());

  ['dynamic', 'static'].forEach(function(codeGenMode) {
    [false, true].forEach(function(withMetadata) {
      registerSuite.bind(this)(codeGenMode, withMetadata);
    });
  });
  // registerSuite.bind(this)('dynamic', true);

  describe('suppressed', function() {
    agentControls.registerTestHooks();
    serverControls = new ServerControls({ agentControls: agentControls });
    serverControls.registerTestHooks();
    clientControls = new ClientControls({ agentControls: agentControls });
    clientControls.registerTestHooks();

    it('should not trace when suppressed', function() {
      return clientControls
        .sendRequest({
          method: 'POST',
          path: '/unary-call',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
        .then(function(response) {
          expect(response.reply).to.equal('received: request');
          return Promise.delay(config.getTestTimeout() / 4);
        })
        .then(function() {
          return agentControls.getSpans().then(function(spans) {
            expect(spans).to.have.lengthOf(0);
          });
        });
    });
  });
});

function registerSuite(codeGenMode, withMetadata) {
  describe('codegen: ' + codeGenMode + ', with metadata: ' + withMetadata, function() {
    var env = {};
    if (codeGenMode === 'static') {
      env.GRPC_STATIC = true;
    }
    if (withMetadata) {
      env.GRPC_WITH_METADATA = true;
    }

    agentControls.registerTestHooks();
    serverControls = new ServerControls({
      agentControls: agentControls,
      env: env
    });
    serverControls.registerTestHooks();
    clientControls = new ClientControls({
      agentControls: agentControls,
      env: env
    });
    clientControls.registerTestHooks();

    it('must trace an unary call', function() {
      var expectedReply = 'received: request' + (withMetadata ? ' & test-content' : '');
      return runTest('/unary-call', expectedReply);
    });

    it('must cancel an unary call', function() {
      return runTest('/unary-call', null, true, false);
    });

    it('must mark unary call as erroneous', function() {
      return runTest('/unary-call', null, false, true);
    });

    it('must trace server-side streaming', function() {
      var expectedReply = withMetadata
        ? ['received: request & test-content', 'streaming', 'more', 'data']
        : ['received: request', 'streaming', 'more', 'data'];
      return runTest('/server-stream', expectedReply);
    });

    it('must cancel server-side streaming', function() {
      return runTest('/server-stream', null, true, false);
    });

    it('must mark server-side streaming as erroneous', function() {
      return runTest('/server-stream', null, false, true);
    });

    it('must trace client-side streaming', function() {
      var expectedReply = 'first; second; third';
      return runTest('/client-stream', expectedReply);
    });

    it('must cancel client-side streaming', function() {
      return runTest('/client-stream', null, true, false);
    });

    it('must mark client-side streaming as erroneous', function() {
      return runTest('/client-stream', null, false, true);
    });

    it('must trace bidi streaming', function() {
      var expectedReply = withMetadata
        ? [
            'received: first & test-content',
            'received: second & test-content',
            'received: third & test-content',
            'STOP'
          ]
        : ['received: first', 'received: second', 'received: third', 'STOP'];
      return runTest('/bidi-stream', expectedReply);
    });

    it('must cancel bidi streaming', function() {
      return runTest('/bidi-stream', null, true, false);
    });

    it('must mark bidi streaming as erroneous', function() {
      return runTest('/bidi-stream', null, false, true);
    });
  });

  function runTest(url, expectedReply, cancel, erroneous) {
    return clientControls
      .sendRequest({
        method: 'POST',
        path: url + createQueryParams(cancel, erroneous)
      })
      .then(function(response) {
        if (!erroneous && !cancel) {
          expect(response.reply).to.deep.equal(expectedReply);
        }
        return waitForTrace(url, cancel, erroneous);
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

  function waitForTrace(url, cancel, erroneous) {
    return utils.retry(function() {
      return agentControls.getSpans().then(function(spans) {
        checkTrace(spans, url, cancel, erroneous);
      });
    });
  }

  function checkTrace(spans, url, cancel, erroneous) {
    var httpEntry = utils.expectOneMatching(spans, checkHttpEntry.bind(null, url));
    var grpcExit = utils.expectOneMatching(spans, checkGrpcClientSpan.bind(null, httpEntry, url, cancel, erroneous));
    // Except for server-streaming and bidi-streaming, we cancel the call immediately on the client, so it usually never
    // reaches the server (depends on the timing). Therefore we also do not expect any GRPC server spans to exist. For
    // server-streaming and bidi-streaming we have a communcation channel from the server to the client so that the
    // server can signal to the client when to cancel the call after it has already reached the server, such a channel
    // does not exist for unary call and client side streaming.
    if (!cancel || url === '/server-stream' || url === '/bidi-stream') {
      var grpcEntry = utils.expectOneMatching(spans, checkGrpcServerSpan.bind(null, grpcExit, url, cancel, erroneous));
      utils.expectOneMatching(spans, checkLogSpanDuringGrpcEntry.bind(null, grpcEntry, url, erroneous));
    }
    utils.expectOneMatching(spans, checkLogSpanAfterGrpcExit.bind(null, httpEntry, url, cancel, erroneous));
  }

  function checkHttpEntry(url, span) {
    expect(span.n).to.equal('node.http.server');
    expect(span.k).to.equal(cls.ENTRY);
    expect(span.data.http.url).to.equal(url);
  }

  function checkGrpcClientSpan(httpEntry, url, cancel, erroneous, span) {
    expect(span.n).to.equal('rpc-client');
    expect(span.k).to.equal(cls.EXIT);
    expect(span.t).to.equal(httpEntry.t);
    expect(span.p).to.equal(httpEntry.s);
    expect(span.s).to.be.not.empty;
    expect(span.data.rpc).to.exist;
    expect(span.data.rpc.flavor).to.equal('grpc');
    expect(span.data.rpc.call).to.equal(rpcCallNameForUrl(url));
    if (erroneous) {
      expect(span.ec).to.be.equal(1);
      expect(span.error).to.be.true;
      expect(span.data.rpc.error).to.equal('Boom!');
    } else {
      expect(span.ec).to.be.equal(0);
      expect(span.error).to.be.false;
      expect(span.data.rpc.error).to.not.exist;
    }
  }

  function checkGrpcServerSpan(grpcExit, url, cancel, erroneous, span) {
    expect(span.n).to.equal('rpc-server');
    expect(span.k).to.equal(cls.ENTRY);
    expect(span.t).to.equal(grpcExit.t);
    expect(span.p).to.equal(grpcExit.s);
    expect(span.s).to.be.not.empty;
    expect(span.data.rpc).to.exist;
    expect(span.data.rpc.flavor).to.equal('grpc');
    expect(span.data.rpc.call).to.equal(rpcCallNameForUrl(url));
    if (erroneous) {
      expect(span.ec).to.be.equal(1);
      expect(span.error).to.be.true;
      expect(span.data.rpc.error).to.equal('Boom!');
    } else {
      expect(span.ec).to.be.equal(0);
      expect(span.error).to.be.false;
      expect(span.data.rpc.error).to.not.exist;
    }
  }

  function checkLogSpanAfterGrpcExit(httpEntry, url, cancel, erroneous, span) {
    expect(span.n).to.equal('log.pino');
    expect(span.k).to.equal(cls.EXIT);
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
    expect(span.k).to.equal(cls.EXIT);
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
        throw new Error('Unknown URL: ' + url);
    }
  }
}
