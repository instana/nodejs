/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

/*
 * This Fargate app uses all methods the Instana API has to offer to verify they are available and work when tracing
 * Fargate apps.
 */

const http = require('http');
const { delay, sendToParent } = require('@_local/core/test/test_util');

const instana = require('../..');

const port = process.env.TASK_HTTP_PORT;

const app = new http.Server();

const capturedLogs = {
  debug: [],
  info: [],
  warn: [],
  error: []
};

const capturingLogger = {
  debug(msg) {
    capturedLogs.debug.push(msg);
    console.debug(msg);
  },
  info(msg) {
    capturedLogs.info.push(msg);
    console.log(msg);
  },
  warn(msg) {
    capturedLogs.warn.push(msg);
    console.warn(msg);
  },
  error(msg) {
    capturedLogs.error.push(msg);
    console.error(msg);
  }
};

instana.setLogger(capturingLogger);

app.on('request', (req, res) => {
  const currentSpan = instana.currentSpan();

  // use Instana SDK to create spans manually
  instana.sdk.callback.startExitSpan('custom-span', () => {
    delay(10).then(() => {
      instana.sdk.promise.completeExitSpan();
      res.end(
        JSON.stringify({
          message: 'Hello Fargate!',
          logs: capturedLogs,
          currentSpan,
          currentSpanConstructor: currentSpan.constructor.name
        })
      );
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
  sendToParent('fargate-task: listening');
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
