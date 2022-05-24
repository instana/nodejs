/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const port = process.env.APP_PORT || 3216;

require('../../../../')();

const bodyParser = require('body-parser');
const pinoLogger = require('pino')();
const express = require('express');
const morgan = require('morgan');
const grpc = require('@grpc/grpc-js');
const path = require('path');
const app = express();

const logPrefix = `GRPC-JS Client (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const PROTO_PATH = path.join(__dirname, 'protos/test.proto');

let client;
let makeUnaryCall;
let startServerSideStreaming;
let startClientSideStreaming;
let startBidiStreaming;

function runClient() {
  log('Running GRPC-JS client.');

  const protoLoader = require('@grpc/proto-loader-latest');
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });

  const testProto = grpc.loadPackageDefinition(packageDefinition).instana.node.grpc.test;
  client = new testProto.TestService('localhost:50051', grpc.credentials.createInsecure());

  makeUnaryCall = unaryCall;
  startServerSideStreaming = serverSideStreaming;
  startClientSideStreaming = clientSideStreaming;
  startBidiStreaming = bidiStreaming;
}

runClient();

function unaryCall(cancel, triggerError, cb) {
  const parameter = triggerError ? 'error' : 'request';
  const call = client.makeUnaryCall({ parameter }, cb);

  if (cancel) {
    setTimeout(() => {
      call.cancel();
    }, 1);
  }
}

function serverSideStreaming(cancel, triggerError, cb) {
  const replies = [];
  const call = client.startServerSideStreaming({
    parameter: paramFor(cancel, triggerError)
  });
  let cbCalled = false;

  call.on('data', reply => {
    replies.push(reply.message);

    if (reply.message === 'please cancel') {
      call.cancel();
    }
  });

  call.on('end', () => {
    if (cbCalled) return;

    cbCalled = true;
    cb(null, replies);
  });

  call.on('error', err => {
    if (cbCalled) return;

    cbCalled = true;
    cb(err);
  });
}

function clientSideStreaming(cancel, triggerError, cb) {
  const call = client.startClientSideStreaming(cb);

  if (triggerError) {
    call.write({ parameter: 'error' }, () => {
      call.end();
    });
  } else {
    call.write({ parameter: 'first' }, () => {
      // In case this test includes cancelling the stream from the client side, this timeout/delay makes sure that we
      // actually cancel the stream _before_ all requests have gone through.
      setTimeout(() => {
        call.write({ parameter: 'second' }, () => {
          call.write({ parameter: 'third' }, () => {
            call.end();
          });
        });
      }, 50);
    });
  }
  if (cancel) {
    setImmediate(() => {
      call.cancel();
    });
  }
}

function bidiStreaming(cancel, triggerError, cb) {
  const replies = [];
  const call = client.startBidiStreaming();
  let cbCalled = false;

  call.on('data', reply => {
    replies.push(reply.message);
    if (reply.message === 'please cancel') {
      call.cancel();
    } else if (reply.message === 'STOP') {
      call.end();
    }
  });

  call.on('end', () => {
    if (cbCalled) return;
    cbCalled = true;
    cb(null, replies);
  });

  call.on('error', err => {
    if (cbCalled) return;
    cbCalled = true;
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
