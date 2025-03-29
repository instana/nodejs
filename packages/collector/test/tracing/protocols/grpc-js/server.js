/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/load_express_v4');

require('./mockVersion');
const port = require('../../../test_util/app-port')();

require('../../../..')();
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const pinoLogger = require('pino')();
const app = express();

const logPrefix = `GRPC-JS Server (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const PROTO_PATH = path.join(__dirname, 'protos/test.proto');
let server;

const runServer = async () => {
  log('Running GRPC-JS server.');

  const grpc = require('@grpc/grpc-js');
  const protoloader = require('@grpc/proto-loader');

  const loadedTestServiceProto = protoloader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const testServiceGrpcObject = grpc.loadPackageDefinition(loadedTestServiceProto).instana.node.grpc.test;

  const serverDefinition = {
    makeUnaryCall: unaryCall,
    startServerSideStreaming: serverSideStreaming,
    startClientSideStreaming: clientSideStreaming,
    startBidiStreaming: bidiStreaming
  };

  function main() {
    return new Promise((resolve, reject) => {
      server = new grpc.Server();
      server.addService(testServiceGrpcObject.TestService.service, serverDefinition);

      server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), err => {
        if (err) return reject(err);
        server.start();
        resolve();
      });
    });
  }

  await main();
};

runServer();

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

function serverSideStreaming(call) {
  // write some data unconditionally
  call.write(replyForCall(call));
  call.write(createReply('streaming'));

  // now trigger an error or continue non-erroneous flow
  if (callWantsCancel(call)) {
    pinoLogger.warn('/server-stream');
    call.write(createReply('please cancel'));
  } else if (callWantsError(call)) {
    const error = new Error('Boom!');
    pinoLogger.error(error);
    call.emit('error', error);
  } else {
    call.write(createReply('more'));
    call.write(createReply('data'));
    pinoLogger.warn('/server-stream');
    call.end();
  }
}

function clientSideStreaming(call, callback) {
  const requests = [];
  let hadError = false;

  call.on('data', request => {
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
      callback(null, createReply(replyMessage));
    }
  });
}

function bidiStreaming(call) {
  let receivedCounter = 0;
  let hadError = false;

  call.on('data', request => {
    if (requestWantsCancel(request)) {
      pinoLogger.warn('/bidi-stream');
      call.write(createReply('please cancel'));
    } else if (requestWantsError(request)) {
      hadError = true;
      const error = new Error('Boom!');
      pinoLogger.error(error);
      call.emit('error', error);
    } else {
      call.write(replyForRequest(call, request));
      if (++receivedCounter >= 3) {
        call.write(createReply('STOP'));
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
  const replyMessage = `received: ${getParameterFrom(request)}`;
  return createReply(replyMessage);
}

function createReply(message) {
  return { message };
}

function getParameterFrom(request) {
  return request.parameter;
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
