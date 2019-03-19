/* eslint-disable no-console */

'use strict';

var agentPort = process.env.AGENT_PORT;

var instana = require('../../../')({
  agentPort: agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var fs = require('fs');
var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');
var path = require('path');
var request = require('request-promise');

var delay = require('../../util/delay');
var DummyEmitter = require('./dummyEmitter');

var app = express();
var logPrefix = 'SDK: Server (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

process.on('message', function(message) {
  if (typeof message !== 'object' || Array.isArray(message)) {
    return process.send('error: malformed message, only non-array objects are allowed: ' + JSON.stringify(message));
  }
  if (!message.command) {
    return process.send('error: message has no command attribute: ' + JSON.stringify(message));
  }
  switch (message.command) {
    case 'start-entry':
      startEntry(message);
      break;
    case 'event-emitter':
      createSpansWithEventEmitter(message);
      break;
    case 'nest-entry-exit':
      nestEntryExit(message);
      break;
    case 'nest-intermediates':
      nestIntermediates(message);
      break;

    default:
      process.send('error: unknown command: ' + message.command);
  }
});

function startEntry(message) {
  if (!message.type) {
    return process.send('error: command start-entry needs a type attribute: ' + JSON.stringify(message));
  }
  switch (message.type) {
    case 'callback':
      startEntryCallback(message);
      break;
    case 'promise':
      startEntryPromise(message);
      break;
    default:
      process.send('error: unknown command type: ' + message.type);
  }
}

function startEntryCallback(message) {
  instana.sdk.callback.startEntrySpan(
    'custom-entry',
    message.withData === 'start' || message.withData === 'both' ? { start: 'whatever' } : null,
    message.traceId,
    message.parentSpanId,
    function() {
      afterCreateEntry(instana.sdk.callback, message);
    }
  );
}

function startEntryPromise(message) {
  instana.sdk.promise
    .startEntrySpan(
      'custom-entry',
      message.withData === 'start' || message.withData === 'both' ? { start: 'whatever' } : null,
      message.traceId,
      message.parentSpanId
    )
    .then(function() {
      afterCreateEntry(instana.sdk.promise, message);
    });
}

function afterCreateEntry(instanaSdk, message) {
  // follow-up with an IO action that is auto-traced to validate tracing context integrity
  request('http://127.0.0.1:' + agentPort).then(function() {
    var error = message.error ? new Error('Boom!') : null;
    instanaSdk.completeEntrySpan(
      error,
      message.withData === 'end' || message.withData === 'both' ? { end: 'some value' } : null
    );
    process.send('done: ' + message.command);
  });
}

app.post('/callback/create-intermediate', function(req, res) {
  var file = getFile(req);
  var encoding = 'UTF-8';
  instana.sdk.callback.startIntermediateSpan(
    'intermediate-file-access',
    {
      path: file,
      encoding: encoding
    },
    function() {
      afterCreateIntermediate(instana.sdk.callback, file, encoding, res);
    }
  );
});

app.post('/promise/create-intermediate', function(req, res) {
  var file = getFile(req);
  var encoding = 'UTF-8';
  instana.sdk.promise
    .startIntermediateSpan('intermediate-file-access', {
      path: file,
      encoding: encoding
    })
    .then(function() {
      afterCreateIntermediate(instana.sdk.promise, file, encoding, res);
    });
});

function afterCreateIntermediate(instanaSdk, file, encoding, res) {
  fs.readFile(file, encoding, function(err, content) {
    if (err) {
      if (err.code === 'ENOENT') {
        return request('http://127.0.0.1:' + agentPort).then(function() {
          // intermediate span is finished after the http exit, so the http exit is s child of the intermediate span
          instana.sdk.callback.completeIntermediateSpan(err, { error: err.message });
          return res.sendStatus(404);
        });
      }
      return res.status(500).send(err);
    }
    // trigger another IO action that is auto-traced to validate tracing context integrity
    request('http://127.0.0.1:' + agentPort).then(function() {
      // intermediate span is finished after the http exit, so the http exit is s child of the intermediate span
      instana.sdk.callback.completeIntermediateSpan(null, { success: true });
      res.send(content);
    });
  });
}

app.post('/callback/create-exit', function(req, res) {
  var file = getFile(req);
  var encoding = 'UTF-8';
  instana.sdk.callback.startExitSpan(
    'file-access',
    {
      path: file,
      encoding: encoding
    },
    function() {
      afterCreateExit(instana.sdk.callback, file, encoding, res);
    }
  );
});

app.post('/promise/create-exit', function(req, res) {
  var file = getFile(req);
  var encoding = 'UTF-8';
  instana.sdk.promise
    .startExitSpan('file-access', {
      path: file,
      encoding: encoding
    })
    .then(function() {
      afterCreateExit(instana.sdk.promise, file, encoding, res);
    });
});

function getFile(req) {
  return req.query.error
    ? path.resolve(__dirname, '../../../does-not-exist')
    : path.resolve(__dirname, '../../../LICENSE');
}

function afterCreateExit(instanaSdk, file, encoding, res) {
  fs.readFile(file, encoding, function(err, content) {
    if (err) {
      instanaSdk.completeExitSpan(err, { error: err.message });
      if (err.code === 'ENOENT') {
        return request('http://127.0.0.1:' + agentPort).then(function() {
          return res.sendStatus(404);
        });
      }
      return res.status(500).send(err);
    }
    instanaSdk.completeExitSpan(null, { success: true });
    // follow-up with an IO action that is auto-traced to validate tracing context integrity
    request('http://127.0.0.1:' + agentPort).then(function() {
      res.send(content);
    });
  });
}

function createSpansWithEventEmitter(message) {
  if (!message.type) {
    return process.send('error: command event-emitter needs a type attribute: ' + JSON.stringify(message));
  }
  switch (message.type) {
    case 'callback':
      createSpansWithEventEmitterCallback(message);
      break;
    case 'promise':
      createSpansWithEventEmitterPromise(message);
      break;
    default:
      process.send('error: unknown command type: ' + message.type);
  }
}

function createSpansWithEventEmitterCallback(message) {
  var emitter = new DummyEmitter();
  emitter.start();
  instana.sdk.callback.startEntrySpan('custom-entry', function() {
    onEmittedEvent(instana.sdk.callback, emitter, message);
  });
}

function createSpansWithEventEmitterPromise(message) {
  var emitter = new DummyEmitter();
  emitter.start();
  instana.sdk.promise.startEntrySpan('custom-entry').then(function() {
    onEmittedEvent(instana.sdk.promise, emitter, message);
  });
}

function onEmittedEvent(instanaSdk, emitter, message) {
  var receivedTicks = 0;
  instanaSdk.bindEmitter(emitter);
  emitter.on('tick', function() {
    if (receivedTicks++ === 5) {
      emitter.stop();
      request('http://127.0.0.1:' + agentPort).then(function() {
        instanaSdk.completeEntrySpan();
        process.send('done: ' + message.command);
      });
    }
  });
}

function nestEntryExit(message) {
  if (!message.type) {
    return process.send('error: command nest-entry-exit needs a type attribute: ' + JSON.stringify(message));
  }
  switch (message.type) {
    case 'callback':
      nestEntryExitCallback(message);
      break;
    case 'promise':
      nestEntryExitPromise(message);
      break;
    default:
      process.send('error: unknown command type: ' + message.type);
  }
}

function nestEntryExitCallback(message) {
  instana.sdk.callback.startEntrySpan('custom-entry', function() {
    setTimeout(function() {
      instana.sdk.callback.startExitSpan('custom-exit', function() {
        setTimeout(function() {
          // It might be a little surprising that this actually works - we complete the exit span and then immediately
          // and synchronously (that is, in the same async context) complete its parent span, the entry span. Completing
          // the entry span will only work if it is the currently active span. How does the entry span become the active
          // span when the exit span is completed? This is handled by clsHooked - when we start a new span, we wrap this
          // in cls.ns.runAndReturn or cls.ns.runPromise. Those will create a new _context_ in clsHooked. All clsHooked
          // context objects are created by inheriting prototypical from their parent context
          // (basically Object.create(this.active)). By completing the exit span we trigger its cleanup functions (see
          // src/tracing/cls.js). One of these is the `unset` function returned by cls.ns.set (added as a cleanup
          // function in cls.startSpan). This unset function will delete the 'com.instana.span' key from the active
          // context. The next time we access the 'com.instana.span' attribute on that (now more or less empty) context,
          // its parent context's 'com.instana.span' value will be used (due to prototypical inheritance).
          instana.sdk.callback.completeExitSpan();
          instana.sdk.callback.completeEntrySpan();
          process.send('done: ' + message.command);
        }, 50);
      });
    }, 50);
  });
}

function nestEntryExitPromise(message) {
  instana.sdk.promise
    .startEntrySpan('custom-entry')
    .then(function() {
      return delay(50);
    })
    .then(function() {
      return instana.sdk.promise
        .startExitSpan('custom-exit')
        .then(function() {
          return delay(50);
        })
        .then(function() {
          instana.sdk.promise.completeExitSpan();
        });
    })
    .then(function() {
      instana.sdk.promise.completeEntrySpan();
      process.send('done: ' + message.command);
    });
}

function nestIntermediates(message) {
  if (!message.type) {
    return process.send('error: command nest-intermediates needs a type attribute: ' + JSON.stringify(message));
  }
  switch (message.type) {
    case 'callback':
      nestIntermediatesCallback(message);
      break;
    case 'promise':
      nestIntermediatesPromise(message);
      break;
    default:
      process.send('error: unknown command type: ' + message.type);
  }
}

function nestIntermediatesCallback(message) {
  instana.sdk.callback.startEntrySpan('custom-entry', function() {
    setTimeout(function() {
      instana.sdk.callback.startIntermediateSpan('intermediate-1', function() {
        setTimeout(function() {
          instana.sdk.callback.startIntermediateSpan('intermediate-2', function() {
            setTimeout(function() {
              instana.sdk.callback.startExitSpan('custom-exit', function() {
                setTimeout(function() {
                  instana.sdk.callback.completeExitSpan();
                  instana.sdk.callback.completeIntermediateSpan();
                  instana.sdk.callback.completeIntermediateSpan();
                  instana.sdk.callback.completeEntrySpan();
                  process.send('done: ' + message.command);
                }, 50);
              });
            }, 50);
          });
        }, 50);
      });
    }, 50);
  });
}

function nestIntermediatesPromise(message) {
  instana.sdk.promise
    .startEntrySpan('custom-entry')
    .then(function() {
      return delay(50);
    })
    .then(function() {
      instana.sdk.promise
        .startIntermediateSpan('intermediate-1')
        .then(function() {
          return delay(50);
        })
        .then(function() {
          instana.sdk.promise
            .startIntermediateSpan('intermediate-2')
            .then(function() {
              return delay(50);
            })
            .then(function() {
              instana.sdk.promise
                .startExitSpan('custom-exit')
                .then(function() {
                  return delay(50);
                })
                .then(function() {
                  instana.sdk.promise.completeExitSpan();
                  instana.sdk.promise.completeIntermediateSpan();
                  instana.sdk.promise.completeIntermediateSpan();
                  instana.sdk.promise.completeEntrySpan();
                  process.send('done: ' + message.command);
                });
            });
        });
    });
}

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
