/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const http = require('http');
const { delay, sendToParent } = require('../../../core/test/test_util');
const instana = require('../..');

const getAppPort = require('@_local/collector/test/test_util/app-port');
const port = getAppPort();

const capturedLogs = {
  debug: [],
  info: [],
  warn: [],
  error: []
};

const capturingLogger = {
  debug: logAndCapture('debug'),
  info: logAndCapture('info'),
  warn: logAndCapture('warn'),
  error: logAndCapture('error')
};

instana.setLogger(capturingLogger);

const app = http.createServer((req, res) => {
  const currentSpan = instana.currentSpan();

  instana.sdk.callback.startExitSpan('custom-span', () => {
    delay(10).then(() => {
      instana.sdk.promise.completeExitSpan();
      sendResponse(res, currentSpan);
    });
  });

  // we only call disableAutoEnd to verify the function is there
  currentSpan.disableAutoEnd();
  // revert disableAutoEnd immediately
  if (currentSpan.span) {
    currentSpan.span.manualEndMode = false;
  }
  // check that the opentracing API is available
  instana.opentracing.createTracer();
});

app.listen(port, () => {
  sendToParent('serverless-collector-app: listening');
  console.log(`Listening on port ${port}.`);
});

function logAndCapture(level) {
  return msg => {
    capturedLogs[level].push(msg);
    console[level](msg);
  };
}

function sendResponse(response, currentSpan) {
  response.end(
    JSON.stringify({
      message: 'Hello from Serverless Collector App!',
      logs: capturedLogs,
      currentSpan,
      currentSpanConstructor: currentSpan.constructor.name
    })
  );
}
