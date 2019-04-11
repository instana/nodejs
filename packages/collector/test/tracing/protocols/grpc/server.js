/* eslint-disable no-console */

'use strict';

var port = process.env.APP_PORT || 3217;
var agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort: agentPort,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

// pino log spans are used to verify that follow up calls are traced correctly after a GRPC exit
var pinoLogger = require('pino')();
var express = require('express');
var morgan = require('morgan');
var path = require('path');
var app = express();

var STATIC = !!process.env.GRPC_STATIC;
var PACKAGE_VERSION = require('./versionUnderTest')();
var PROTO_PATH = path.join(__dirname, 'protos/test.proto');
var logPrefix = 'GRPC Server (' + process.pid + '):\t';

var messages;
var server;

var dynamicServerDef = {
  makeUnaryCall: unaryCall,
  startServerSideStreaming: serverSideStreaming(false),
  startClientSideStreaming: clientSideStreaming,
  startBidiStreaming: bidiStreaming
};

var staticServerDef = {
  makeUnaryCall: unaryCall,
  startServerSideStreaming: serverSideStreaming(true),
  startClientSideStreaming: clientSideStreaming,
  startBidiStreaming: bidiStreaming
};

switch (PACKAGE_VERSION) {
  case '=1.10.1':
    if (STATIC) {
      runStaticLegacyServer();
    } else {
      runDynamicLegacyServer();
    }
    break;
  case '>=1.17.0':
    if (STATIC) {
      runStaticModernServer();
    } else {
      runDynamicModernServer();
    }
    break;
  default:
    throw new Error('Unsupported API version: ' + PACKAGE_VERSION);
}

/**
 * grpc@1.10.1, dynamic codegen
 */
function runDynamicLegacyServer() {
  log('Running dynamic legacy GRPC server.');

  var grpc = require('grpc');
  var testProto = grpc.load(PROTO_PATH).instana.node.grpc.test;

  function main() {
    server = new grpc.Server();
    server.addService(testProto.TestService.service, dynamicServerDef);
    server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
    server.start();
  }

  main();
}

/**
 * grpc@1.10.1, static codegen
 */
function runStaticLegacyServer() {
  log('Running static legacy GRPC server.');

  messages = require('./test_pb');
  var services = require('./test_grpc_pb');

  var grpc = require('grpc');

  function main() {
    server = new grpc.Server();
    server.addService(services.TestServiceService, staticServerDef);
    server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
    server.start();
  }

  main();
}

/**
 * grpc@^1.17.0, dynamic codegen
 */
function runDynamicModernServer() {
  log('Running dynamic modern GRPC server.');

  var grpc = require('grpc');
  var protoLoader = require('@grpc/proto-loader');
  var packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  var testProto = grpc.loadPackageDefinition(packageDefinition).instana.node.grpc.test;

  function main() {
    server = new grpc.Server();
    server.addService(testProto.TestService.service, dynamicServerDef);
    server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
    server.start();
  }

  main();
}

/**
 * grpc@^1.17.0, static codegen
 */
function runStaticModernServer() {
  log('Running static modern GRPC server.');

  messages = require('./test_pb');
  var services = require('./test_grpc_pb');

  var grpc = require('grpc');

  function main() {
    server = new grpc.Server();
    server.addService(services.TestServiceService, staticServerDef);
    server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
    server.start();
  }

  main();
}

function unaryCall(call, callback) {
  if (callWantsError(call)) {
    var error = new Error('Boom!');
    pinoLogger.error(error);
    callback(error);
  } else {
    pinoLogger.warn('/unary-call');
    callback(null, replyForCall(call));
  }
}

function serverSideStreaming(isStatic) {
  return function(call) {
    // write some data unconditionally
    call.write(replyForCall(call));
    call.write(createReply('streaming', isStatic));
    // now trigger an error or continue non-erroneous flow
    if (callWantsCancel(call)) {
      pinoLogger.warn('/server-stream');
      call.write(createReply('please cancel', isStatic));
    } else if (callWantsError(call)) {
      var error = new Error('Boom!');
      pinoLogger.error(error);
      call.emit('error', error);
    } else {
      call.write(createReply('more', isStatic));
      call.write(createReply('data', isStatic));
      pinoLogger.warn('/server-stream');
      call.end();
    }
  };
}

function clientSideStreaming(call, callback) {
  var requests = [];
  var hadError = false;
  var isStatic = false;
  call.on('data', function(request) {
    isStatic = isRequestStatic(request);
    if (requestWantsError(request)) {
      hadError = true;
      var error = new Error('Boom!');
      pinoLogger.error(error);
      return callback(error);
    }
    requests.push(request);
  });
  call.on('end', function() {
    if (!hadError) {
      var replyMessage = requests.map(getParameterFrom).join('; ');
      pinoLogger.warn('/client-stream');
      callback(null, createReply(replyMessage, isStatic));
    }
  });
}

function bidiStreaming(call) {
  var receivedCounter = 0;
  var hadError = false;
  call.on('data', function(request) {
    if (requestWantsCancel(request)) {
      pinoLogger.warn('/bidi-stream');
      call.write(createReply('please cancel', isRequestStatic(request)));
    } else if (requestWantsError(request)) {
      hadError = true;
      var error = new Error('Boom!');
      pinoLogger.error(error);
      call.emit('error', error);
    } else {
      call.write(replyForRequest(call, request));
      if (++receivedCounter >= 3) {
        call.write(createReply('STOP', isRequestStatic(request)));
      }
    }
  });
  call.on('end', function() {
    if (!hadError) {
      pinoLogger.warn('/bidi-stream');
      call.end();
    }
  });
}

function replyForCall(call) {
  return replyForRequest(call, call.request);
}

function replyForRequest(call, request) {
  var replyMessage = 'received: ' + getParameterFrom(request);
  var metadataContent = call.metadata.get('test-metadata');
  if (metadataContent && metadataContent.length && metadataContent.length > 0) {
    replyMessage += ' & ' + metadataContent[0];
  }
  return createReply(replyMessage, isRequestStatic(request));
}

function createReply(message, isStatic) {
  if (isStatic) {
    var reply = new messages.TestReply();
    reply.setMessage(message);
    return reply;
  } else {
    return { message: message };
  }
}

function isRequestStatic(request) {
  return typeof request.getParameter === 'function';
}

function getParameterFrom(request) {
  if (isRequestStatic(request)) {
    return request.getParameter();
  } else {
    return request.parameter;
  }
}

function callWantsCancel(call) {
  return requestWantsCancel(call.request);
}

function requestWantsCancel(request) {
  return getParameterFrom(request) === 'cancel';
}

function callWantsError(call) {
  return requestWantsError(call.request);
}

function requestWantsError(request) {
  return getParameterFrom(request) === 'error';
}

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.get('/', function(req, res) {
  res.send('OK');
});

app.listen(port, function() {
  log('Listening on port: ' + port);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'GRPC Server (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
