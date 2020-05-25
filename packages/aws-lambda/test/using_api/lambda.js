/* eslint-disable indent, import/order, no-console */

'use strict';

const instana = require('../..');

const delay = require('../../../core/test/test_util/delay');

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../src/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..');

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

/**
 * This Lambda uses all methods the Instana API has to offer to verify they are available and work when tracing Lambdas.
 */
const handler = async event => {
  console.log('in actual handler');

  instana.setLogger(capturingLogger);
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
  await instana.sdk.async.startExitSpan('custom-span');
  await delay(100); // give the collector a chance to read the main package.json
  instana.sdk.async.completeExitSpan();

  if (event.error) {
    throw new Error('Boom!');
  } else {
    return {
      body: {
        message: 'Stan says hi!',
        logs: capturedLogs,
        currentSpan,
        currentSpanConstructor: currentSpan.constructor.name
      }
    };
  }
};

const args = process.env.WITH_CONFIG
  ? [
      {
        tracing: {
          stackTraceLength: 2
        }
      },
      handler
    ]
  : [handler];

exports.handler = instana.wrap.apply(instana, args);
