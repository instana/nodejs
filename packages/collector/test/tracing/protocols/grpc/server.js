/* eslint-disable no-console */

'use strict';

const port = process.env.APP_PORT || 3217;
const agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const express = require('express');
const morgan = require('morgan');
const path = require('path');
// Pino log spans are used to verify that follow up calls are traced correctly after a GRPC exit.
const pinoLogger = require('pino')();

const app = express();

const STATIC = !!process.env.GRPC_STATIC;
const PACKAGE_VERSION = require('./versionUnderTest')();
const PROTO_PATH = path.join(__dirname, 'protos/test.proto');
const logPrefix = `GRPC Server (${process.pid}):\t`;

let messages;
let server;

const dynamicServerDef = {
  makeUnaryCall: unaryCall,
  startServerSideStreaming: serverSideStreaming(false),
  startClientSideStreaming: clientSideStreaming,
  startBidiStreaming: bidiStreaming
};

const staticServerDef = {
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
    throw new Error(`Unsupported API version: ${PACKAGE_VERSION}`);
}

/**
 * grpc@1.10.1, dynamic codegen
 */
function runDynamicLegacyServer() {
  log('Running dynamic legacy GRPC server.');

  const grpc = require('grpc');
  const testProto = grpc.load(PROTO_PATH).instana.node.grpc.test;

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
  const services = require('./test_grpc_pb');

  const grpc = require('grpc');

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

  const grpc = require('grpc');
  const protoLoader = require('@grpc/proto-loader');
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const testProto = grpc.loadPackageDefinition(packageDefinition).instana.node.grpc.test;

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
  const services = require('./test_grpc_pb');

  const grpc = require('grpc');

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
    const error = new Error('Boom!');
    pinoLogger.error(error);
    callback(error);
  } else {
    pinoLogger.warn('/unary-call');
    callback(null, replyForCall(call));
  }
}

function serverSideStreaming(isStatic) {
  return call => {
    // write some data unconditionally
    call.write(replyForCall(call));
    call.write(createReply('streaming', isStatic));
    // now trigger an error or continue non-erroneous flow
    if (callWantsCancel(call)) {
      pinoLogger.warn('/server-stream');
      call.write(createReply('please cancel', isStatic));
    } else if (callWantsError(call)) {
      const error = new Error('Boom!');
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
  const requests = [];
  let hadError = false;
  let isStatic = false;
  call.on('data', request => {
    isStatic = isRequestStatic(request);
    if (requestWantsError(request)) {
      hadError = true;
      const error = new Error('Boom!');
      pinoLogger.error(error);
      return callback(error);
    }
    requests.push(request);
  });
  call.on('end', () => {
    if (!hadError) {
      const replyMessage = requests.map(getParameterFrom).join('; ');
      pinoLogger.warn('/client-stream');
      callback(null, createReply(replyMessage, isStatic));
    }
  });
}

function bidiStreaming(call) {
  let receivedCounter = 0;
  let hadError = false;
  call.on('data', request => {
    if (requestWantsCancel(request)) {
      pinoLogger.warn('/bidi-stream');
      call.write(createReply('please cancel', isRequestStatic(request)));
    } else if (requestWantsError(request)) {
      hadError = true;
      const error = new Error('Boom!');
      pinoLogger.error(error);
      call.emit('error', error);
    } else {
      call.write(replyForRequest(call, request));
      if (++receivedCounter >= 3) {
        call.write(createReply('STOP', isRequestStatic(request)));
      }
    }
  });
  call.on('end', () => {
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
  let replyMessage = `received: ${getParameterFrom(request)}`;
  const metadataContent = call.metadata.get('test-metadata');
  if (metadataContent && metadataContent.length && metadataContent.length > 0) {
    replyMessage += ` & ${metadataContent[0]}`;
  }
  return createReply(replyMessage, isRequestStatic(request));
}

function createReply(message, isStatic) {
  if (isStatic) {
    const reply = new messages.TestReply();
    reply.setMessage(message);
    return reply;
  } else {
    return { message };
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
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `GRPC Server (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
