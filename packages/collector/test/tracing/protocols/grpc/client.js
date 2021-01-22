/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const port = process.env.APP_PORT || 3216;

require('../../../../')();

const bodyParser = require('body-parser');
// pino log spans are used to verify that follow up calls are traced correctly after a GRPC exit
const pinoLogger = require('pino')();
const express = require('express');
const morgan = require('morgan');
const grpc = require('grpc');
const path = require('path');
const app = express();

const STATIC = !!process.env.GRPC_STATIC;
const withMetadata = !!process.env.GRPC_WITH_METADATA;
const withOptions = !!process.env.GRPC_WITH_OPTIONS;
const PACKAGE_VERSION = require('./versionUnderTest')();
const PROTO_PATH = path.join(__dirname, 'protos/test.proto');
const logPrefix = `GRPC Client (${process.pid}):\t`;

let client;
let messages;
let makeUnaryCall;
let startServerSideStreaming;
let startClientSideStreaming;
let startBidiStreaming;

const loggingInterceptor = (options, nextCall) =>
  new grpc.InterceptingCall(nextCall(options), {
    sendMessage: function(message, next) {
      pinoLogger.warn('intercepted', message);
      next(message);
    }
  });

switch (PACKAGE_VERSION) {
  case '=1.10.1':
    if (STATIC) {
      runStaticLegacyClient();
    } else {
      runDynamicLegacyClient();
    }
    break;
  case '>=1.17.0':
    if (STATIC) {
      runStaticModernClient();
    } else {
      runDynamicModernClient();
    }
    break;
  default:
    throw new Error(`Unsupported API version: ${PACKAGE_VERSION}`);
}

/**
 * grpc@1.10.1, dynamic codegen
 */
function runDynamicLegacyClient() {
  log('Running dynamic legacy GRPC client.');

  const testProto = grpc.load(PROTO_PATH).instana.node.grpc.test;
  client = new testProto.TestService('localhost:50051', grpc.credentials.createInsecure());
  makeUnaryCall = dynamicUnaryCall;
  startServerSideStreaming = dynamicServerSideStreaming;
  startClientSideStreaming = dynamicClientSideStreaming;
  startBidiStreaming = dynamicBidiStreaming;
}

/**
 * grpc@1.10.1, static codegen
 */
function runStaticLegacyClient() {
  log('Running static legacy GRPC client.');

  messages = require('./test_pb');
  const services = require('./test_grpc_pb');
  client = new services.TestServiceClient('localhost:50051', grpc.credentials.createInsecure());
  makeUnaryCall = staticUnaryCall;
  startServerSideStreaming = staticServerSideStreaming;
  startClientSideStreaming = staticClientSideStreaming;
  startBidiStreaming = staticBidiStreaming;
}

/**
 * grpc@^1.17.0, dynamic codegen
 */
function runDynamicModernClient() {
  log('Running dynamic modern GRPC client.');

  const protoLoader = require('@grpc/proto-loader');
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const testProto = grpc.loadPackageDefinition(packageDefinition).instana.node.grpc.test;
  client = new testProto.TestService('localhost:50051', grpc.credentials.createInsecure());
  makeUnaryCall = dynamicUnaryCall;
  startServerSideStreaming = dynamicServerSideStreaming;
  startClientSideStreaming = dynamicClientSideStreaming;
  startBidiStreaming = dynamicBidiStreaming;
}

/**
 * grpc@^1.17.0, static codegen
 */
function runStaticModernClient() {
  log('Running static modern GRPC client.');

  messages = require('./test_pb');
  const services = require('./test_grpc_pb');
  client = new services.TestServiceClient('localhost:50051', grpc.credentials.createInsecure());
  makeUnaryCall = staticUnaryCall;
  startServerSideStreaming = staticServerSideStreaming;
  startClientSideStreaming = staticClientSideStreaming;
  startBidiStreaming = staticBidiStreaming;
}

function dynamicUnaryCall(cancel, triggerError, cb) {
  const parameter = triggerError ? 'error' : 'request';
  const options = { interceptors: [loggingInterceptor] };
  let call;
  if (withMetadata && withOptions) {
    call = client.makeUnaryCall({ parameter }, createMetadata(), options, cb);
  } else if (withMetadata) {
    call = client.makeUnaryCall({ parameter }, createMetadata(), cb);
  } else if (withOptions) {
    call = client.makeUnaryCall({ parameter }, options, cb);
  } else {
    call = client.makeUnaryCall({ parameter }, cb);
  }
  if (cancel) {
    setTimeout(() => {
      call.cancel();
    }, 1);
  }
}

function staticUnaryCall(cancel, triggerError, cb) {
  const request = new messages.TestRequest();
  request.setParameter(triggerError ? 'error' : 'request');

  let call;
  if (withMetadata) {
    call = client.makeUnaryCall(request, createMetadata(), cb);
  } else {
    call = client.makeUnaryCall(request, cb);
  }
  if (cancel) {
    setTimeout(() => {
      call.cancel();
    }, 1);
  }
}

function dynamicServerSideStreaming(cancel, triggerError, cb) {
  const replies = [];
  const request = { parameter: paramFor(cancel, triggerError) };
  const call = withMetadata
    ? client.startServerSideStreaming(request, createMetadata())
    : client.startServerSideStreaming(request);

  call.on('data', reply => {
    replies.push(reply.message);
    if (reply.message === 'please cancel') {
      call.cancel();
    }
  });
  call.on('end', () => {
    cb(null, replies);
  });
  call.on('error', err => {
    cb(err);
  });
}

function staticServerSideStreaming(cancel, triggerError, cb) {
  const replies = [];
  const request = new messages.TestRequest();
  request.setParameter(paramFor(cancel, triggerError));
  const call = withMetadata
    ? client.startServerSideStreaming(request, createMetadata())
    : client.startServerSideStreaming(request);
  call.on('data', reply => {
    if (reply.getMessage() === 'please cancel') {
      call.cancel();
    }
    replies.push(reply.getMessage());
  });
  call.on('end', () => {
    cb(null, replies);
  });
  call.on('error', err => {
    cb(err);
  });
}

function dynamicClientSideStreaming(cancel, triggerError, cb) {
  const call = withMetadata
    ? client.startClientSideStreaming(createMetadata(), cb)
    : client.startClientSideStreaming(cb);
  if (triggerError) {
    call.write({ parameter: 'error' }, () => {
      call.end();
    });
  } else {
    call.write({ parameter: 'first' }, () => {
      call.write({ parameter: 'second' }, () => {
        call.write({ parameter: 'third' }, () => {
          call.end();
        });
      });
    });
  }
  if (cancel) {
    setTimeout(() => {
      call.cancel();
    }, 1);
  }
}

function staticClientSideStreaming(cancel, triggerError, cb) {
  const call = withMetadata
    ? client.startClientSideStreaming(createMetadata(), cb)
    : client.startClientSideStreaming(cb);
  let request = new messages.TestRequest();
  if (triggerError) {
    request.setParameter('error');
    call.write(request, () => {
      call.end();
    });
  } else {
    request.setParameter('first');
    call.write(request, () => {
      request = new messages.TestRequest();
      request.setParameter('second');
      call.write(request, () => {
        request = new messages.TestRequest();
        request.setParameter('third');
        call.write(request, () => {
          call.end();
        });
      });
    });
  }
  if (cancel) {
    setTimeout(() => {
      call.cancel();
    }, 1);
  }
}

function dynamicBidiStreaming(cancel, triggerError, cb) {
  const replies = [];
  const call = withMetadata ? client.startBidiStreaming(createMetadata()) : client.startBidiStreaming();
  call.on('data', reply => {
    replies.push(reply.message);
    if (reply.message === 'please cancel') {
      call.cancel();
    } else if (reply.message === 'STOP') {
      call.end();
    }
  });
  call.on('end', () => {
    cb(null, replies);
  });
  call.on('error', err => {
    cb(err);
  });

  if (triggerError) {
    call.write({ parameter: 'error' }, () => {
      call.end();
    });
  } else {
    call.write({ parameter: 'first' }, () => {
      call.write({ parameter: 'second' }, () => {
        call.write({ parameter: 'third' });
      });
    });
  }
}

function staticBidiStreaming(cancel, triggerError, cb) {
  const replies = [];
  const call = withMetadata ? client.startBidiStreaming(createMetadata()) : client.startBidiStreaming();
  call.on('data', reply => {
    replies.push(reply.getMessage());
    if (reply.message === 'please cancel') {
      call.cancel();
    } else if (reply.getMessage() === 'STOP') {
      call.end();
    }
  });
  call.on('end', () => {
    cb(null, replies);
  });
  call.on('error', err => {
    cb(err);
  });

  let request = new messages.TestRequest();
  if (triggerError) {
    request.setParameter('error');
    call.write(request, () => {
      call.end();
    });
  } else {
    request.setParameter('first');
    call.write(request, () => {
      request = new messages.TestRequest();
      request.setParameter('second');
      call.write(request, () => {
        request = new messages.TestRequest();
        request.setParameter('third');
        call.write(request);
      });
    });
  }
}

function createMetadata() {
  const metadata = new grpc.Metadata();
  metadata.add('test-metadata', 'test-content');
  return metadata;
}

function paramFor(cancel, triggerError) {
  if (triggerError) {
    return 'error';
  } else {
    return cancel ? 'cancel' : 'request';
  }
}

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('OK');
});

app.post('/unary-call', (req, res) => {
  makeUnaryCall(req.query.cancel, req.query.error, (err, reply) => {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    const message = typeof reply.getMessage === 'function' ? reply.getMessage() : reply.message;
    pinoLogger.warn('/unary-call');
    return res.send({ reply: message });
  });
});

app.post('/server-stream', (req, res) => {
  startServerSideStreaming(req.query.cancel, req.query.error, (err, replyMessages) => {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    pinoLogger.warn('/server-stream');
    return res.send({ reply: replyMessages });
  });
});

app.post('/client-stream', (req, res) => {
  startClientSideStreaming(req.query.cancel, req.query.error, (err, reply) => {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    const message = typeof reply.getMessage === 'function' ? reply.getMessage() : reply.message;
    pinoLogger.warn('/client-stream');
    return res.send({ reply: message });
  });
});

app.post('/bidi-stream', (req, res) => {
  startBidiStreaming(req.query.cancel, req.query.error, (err, replyMessages) => {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    pinoLogger.warn('/bidi-stream');
    return res.send({ reply: replyMessages });
  });
});

app.post('/shutdown', (req, res) => {
  client.close();
  return res.send('Good bye :)');
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
