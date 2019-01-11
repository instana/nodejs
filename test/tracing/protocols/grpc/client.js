/* eslint-disable no-console */

'use strict';

var port = process.env.APP_PORT || 3216;
var agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort: agentPort,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
// pino log spans are used to verify that follow up calls are traced correctly after a GRPC exit
var pinoLogger = require('pino')();
var express = require('express');
var morgan = require('morgan');
var grpc = require('grpc');
var path = require('path');
var app = express();

var STATIC = !!process.env.GRPC_STATIC;
var withMetadata = !!process.env.GRPC_WITH_METADATA;
var PACKAGE_VERSION = process.env.GRPC_PACKAGE_VERSION || '=1.10.1';
var PROTO_PATH = path.join(__dirname, 'protos/test.proto');
var logPrefix = 'GRPC Client (' + process.pid + '):\t';

var client;
var messages;
var makeUnaryCall;
var startServerSideStreaming;
var startClientSideStreaming;
var startBidiStreaming;

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
    throw new Error('Unsupported API version: ' + PACKAGE_VERSION);
}

/**
 * grpc@1.10.1, dynamic codegen
 */
function runDynamicLegacyClient() {
  log('Running dynamic legacy GRPC client.');

  var testProto = grpc.load(PROTO_PATH).instana.node.grpc.test;
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
  var services = require('./test_grpc_pb');
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

  var protoLoader = require('@grpc/proto-loader');
  var packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  var testProto = grpc.loadPackageDefinition(packageDefinition).instana.node.grpc.test;
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
  var services = require('./test_grpc_pb');
  client = new services.TestServiceClient('localhost:50051', grpc.credentials.createInsecure());
  makeUnaryCall = staticUnaryCall;
  startServerSideStreaming = staticServerSideStreaming;
  startClientSideStreaming = staticClientSideStreaming;
  startBidiStreaming = staticBidiStreaming;
}

function dynamicUnaryCall(cancel, triggerError, cb) {
  var parameter = triggerError ? 'error' : 'request';
  var call;
  if (withMetadata) {
    call = client.makeUnaryCall({ parameter: parameter }, createMetadata(), cb);
  } else {
    call = client.makeUnaryCall({ parameter: parameter }, cb);
  }
  if (cancel) {
    setTimeout(function() {
      call.cancel();
    }, 1);
  }
}

function staticUnaryCall(cancel, triggerError, cb) {
  var request = new messages.TestRequest();
  request.setParameter(triggerError ? 'error' : 'request');

  var call;
  if (withMetadata) {
    call = client.makeUnaryCall(request, createMetadata(), cb);
  } else {
    call = client.makeUnaryCall(request, cb);
  }
  if (cancel) {
    setTimeout(function() {
      call.cancel();
    }, 1);
  }
}

function dynamicServerSideStreaming(cancel, triggerError, cb) {
  var replies = [];
  var request = { parameter: paramFor(cancel, triggerError) };
  var call = withMetadata
    ? client.startServerSideStreaming(request, createMetadata())
    : client.startServerSideStreaming(request);

  call.on('data', function(reply) {
    replies.push(reply.message);
    if (reply.message === 'please cancel') {
      call.cancel();
    }
  });
  call.on('end', function() {
    cb(null, replies);
  });
  call.on('error', function(err) {
    cb(err);
  });
}

function staticServerSideStreaming(cancel, triggerError, cb) {
  var replies = [];
  var request = new messages.TestRequest();
  request.setParameter(paramFor(cancel, triggerError));
  var call = withMetadata
    ? client.startServerSideStreaming(request, createMetadata())
    : client.startServerSideStreaming(request);
  call.on('data', function(reply) {
    if (reply.getMessage() === 'please cancel') {
      call.cancel();
    }
    replies.push(reply.getMessage());
  });
  call.on('end', function() {
    cb(null, replies);
  });
  call.on('error', function(err) {
    cb(err);
  });
}

function dynamicClientSideStreaming(cancel, triggerError, cb) {
  var call = withMetadata ? client.startClientSideStreaming(createMetadata(), cb) : client.startClientSideStreaming(cb);
  if (triggerError) {
    call.write({ parameter: 'error' }, function() {
      call.end();
    });
  } else {
    call.write({ parameter: 'first' }, function() {
      call.write({ parameter: 'second' }, function() {
        call.write({ parameter: 'third' }, function() {
          call.end();
        });
      });
    });
  }
  if (cancel) {
    setTimeout(function() {
      call.cancel();
    }, 1);
  }
}

function staticClientSideStreaming(cancel, triggerError, cb) {
  var call = withMetadata ? client.startClientSideStreaming(createMetadata(), cb) : client.startClientSideStreaming(cb);
  var request = new messages.TestRequest();
  if (triggerError) {
    request.setParameter('error');
    call.write(request, function() {
      call.end();
    });
  } else {
    request.setParameter('first');
    call.write(request, function() {
      request = new messages.TestRequest();
      request.setParameter('second');
      call.write(request, function() {
        request = new messages.TestRequest();
        request.setParameter('third');
        call.write(request, function() {
          call.end();
        });
      });
    });
  }
  if (cancel) {
    setTimeout(function() {
      call.cancel();
    }, 1);
  }
}

function dynamicBidiStreaming(cancel, triggerError, cb) {
  var replies = [];
  var call = withMetadata ? client.startBidiStreaming(createMetadata()) : client.startBidiStreaming();
  call.on('data', function(reply) {
    replies.push(reply.message);
    if (reply.message === 'please cancel') {
      call.cancel();
    } else if (reply.message === 'STOP') {
      call.end();
    }
  });
  call.on('end', function() {
    cb(null, replies);
  });
  call.on('error', function(err) {
    cb(err);
  });

  if (triggerError) {
    call.write({ parameter: 'error' }, function() {
      call.end();
    });
  } else {
    call.write({ parameter: 'first' }, function() {
      call.write({ parameter: 'second' }, function() {
        call.write({ parameter: 'third' });
      });
    });
  }
}

function staticBidiStreaming(cancel, triggerError, cb) {
  var replies = [];
  var call = withMetadata ? client.startBidiStreaming(createMetadata()) : client.startBidiStreaming();
  call.on('data', function(reply) {
    replies.push(reply.getMessage());
    if (reply.message === 'please cancel') {
      call.cancel();
    } else if (reply.getMessage() === 'STOP') {
      call.end();
    }
  });
  call.on('end', function() {
    cb(null, replies);
  });
  call.on('error', function(err) {
    cb(err);
  });

  var request = new messages.TestRequest();
  if (triggerError) {
    request.setParameter('error');
    call.write(request, function() {
      call.end();
    });
  } else {
    request.setParameter('first');
    call.write(request, function() {
      request = new messages.TestRequest();
      request.setParameter('second');
      call.write(request, function() {
        request = new messages.TestRequest();
        request.setParameter('third');
        call.write(request);
      });
    });
  }
}

function createMetadata() {
  var metadata = new grpc.Metadata();
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
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.send('OK');
});

app.post('/unary-call', function(req, res) {
  makeUnaryCall(req.query.cancel, req.query.error, function(err, reply) {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    var message = typeof reply.getMessage === 'function' ? reply.getMessage() : reply.message;
    pinoLogger.warn('/unary-call');
    return res.send({ reply: message });
  });
});

app.post('/server-stream', function(req, res) {
  startServerSideStreaming(req.query.cancel, req.query.error, function(err, replyMessages) {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    pinoLogger.warn('/server-stream');
    return res.send({ reply: replyMessages });
  });
});

app.post('/client-stream', function(req, res) {
  startClientSideStreaming(req.query.cancel, req.query.error, function(err, reply) {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    var message = typeof reply.getMessage === 'function' ? reply.getMessage() : reply.message;
    pinoLogger.warn('/client-stream');
    return res.send({ reply: message });
  });
});

app.post('/bidi-stream', function(req, res) {
  startBidiStreaming(req.query.cancel, req.query.error, function(err, replyMessages) {
    if (err) {
      pinoLogger.error(err);
      return res.send(err);
    }
    pinoLogger.warn('/bidi-stream');
    return res.send({ reply: replyMessages });
  });
});

app.post('/shutdown', function(req, res) {
  client.close();
  return res.send('Good bye :)');
});

app.listen(port, function() {
  log('Listening on port: ' + port);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
