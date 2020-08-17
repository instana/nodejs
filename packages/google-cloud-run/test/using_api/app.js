/* eslint-disable no-console */

'use strict';

/*
 * This app uses all methods the Instana API has to offer to verify they are available and work when tracing Google
 * Cloud Run services.
 */

const http = require('http');

const sendToParent = require('../../../serverless/test/util/send_to_parent');
const { delay } = require('../../../core/test/test_util');

const instana = require('../..');

const port = process.env.PORT || 4216;

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

  // we only call disableAutoEnd to verify the function is there
  currentSpan.disableAutoEnd();
  // revert disableAutoEnd immediately
  if (currentSpan.span) {
    currentSpan.span.manualEndMode = false;
  }

  // check that the opentracing API is available
  instana.opentracing.createTracer();

  // use Instana SDK
  instana.sdk.promise
    .startExitSpan('custom-span')
    .then(() => delay(10))
    .then(() => {
      instana.sdk.promise.completeExitSpan();
      res.end(
        JSON.stringify({
          message: 'Hello Cloud Run!',
          logs: capturedLogs,
          currentSpan,
          currentSpanConstructor: currentSpan.constructor.name
        })
      );
    });
});

app.listen(port, () => {
  sendToParent('cloud-run-service: listening');
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
