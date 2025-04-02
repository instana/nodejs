/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('../../../..')();
const clsHooked = require('cls-hooked');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino')();

const logPrefix = `cls-hooked-no-conflict (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const app = express();
const port = require('../../../test_util/app-port')();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

// Create a custom cls-hooked namespace for the application under monitoring.
const namespaceID = 'application-under-monitoring';
const namespace = clsHooked.createNamespace(namespaceID);

// An express middleware to add bind custom property to the incoming HTTP request event emitter.
function requestContextFactory() {
  return function requestContext(req, res, next) {
    namespace.run(() => {
      // Binding the request/IncomingMessage object as an event emitter would break the cls based context tracking in
      // @instana/core prior until version 1.137.2.
      namespace.bindEmitter(req);

      // Binding the response does not have an effect on the issue, but we do it here for completeness sake.
      namespace.bindEmitter(res);

      // Set an arbitrary property to be able to check that the cls-hooked binding of the application under monitoring
      // also still works.
      namespace.set('custom-cls-property', 'custom property value');

      return next();
    });
  };
}

function handler(req, res) {
  const customPropertyValue = namespace.active ? namespace.get('custom-cls-property') : 'unknown';

  const activeSpan = instana.currentSpan();
  let instanaTraceId = 'unknown';
  let instanaSpanId = 'unknown';
  if (activeSpan && activeSpan.span) {
    instanaTraceId = activeSpan.span.t;
    instanaSpanId = activeSpan.span.s;
  }

  // Trigger another arbitrary call that is supposed to be traced, to verify that tracing outgoing calls
  // works as expected.
  pino.warn('Should be traced.');

  return res.json({
    'incoming-request': {
      body: req.body
    },
    'cls-contexts': {
      'appliation-under-monitoring': customPropertyValue,
      instana: {
        traceId: instanaTraceId,
        spanId: instanaSpanId
      }
    }
  });
}

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.use(requestContextFactory());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(handler);

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
