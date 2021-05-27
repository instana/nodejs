/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const process = require('process');

const { ENTRY } = require('../../constants');
const shimmer = require('shimmer');
const cls = require('../../cls');
const spanBuffer = require('../../spanBuffer');

const bullSpanName = require('../messaging/bull').spanName;

let isActive = false;

const bullKeepAlive = 10000;

let currentlyActiveBullEntrySpan;

exports.init = function init(config) {
  if (config.tracing.activateBullProcessInstrumentation) {
    shimmer.wrap(process, 'emit', shimProcessEmitForBullChildWorker);
    shimmer.wrap(process, 'send', shimProcessSendForBullChildWorker);
  }
};

function shimProcessEmitForBullChildWorker(originalProcessEmit) {
  return function (event) {
    if (!isActive || event !== 'message') {
      return originalProcessEmit.apply(this, arguments);
    }
    const ipcMessage = arguments[1];

    if (
      //
      !ipcMessage ||
      ipcMessage.cmd !== 'start' ||
      !ipcMessage.job ||
      !ipcMessage.job.opts
    ) {
      return originalProcessEmit.apply(this, arguments);
    }

    const traceContext = ipcMessage.job.opts.instanaTracingContext;
    delete ipcMessage.job.opts.instanaTracingContext;

    if (!traceContext || !traceContext.X_INSTANA_T || !traceContext.X_INSTANA_S) {
      return originalProcessEmit.apply(this, arguments);
    }

    return cls.ns.runAndReturn(() => {
      currentlyActiveBullEntrySpan = cls.putPseudoSpan(
        bullSpanName,
        ENTRY,
        traceContext.X_INSTANA_T,
        traceContext.X_INSTANA_S
      );
      return originalProcessEmit.apply(this, arguments);
    });
  };
}

function shimProcessSendForBullChildWorker(originalProcessSend) {
  return function (message) {
    if (!message || !currentlyActiveBullEntrySpan) {
      return originalProcessSend.apply(this, arguments);
    }
    if (message.cmd === 'completed' || message.cmd === 'failed') {
      currentlyActiveBullEntrySpan.d = Date.now() - currentlyActiveBullEntrySpan.ts;
      currentlyActiveBullEntrySpan.transmit();
      const spanReferenceForKeepAlive = currentlyActiveBullEntrySpan;
      currentlyActiveBullEntrySpan = null;

      // Improve the chances that we can offload the spans to an agent for a Bull child process worker by keeping it
      // alive for a few more seconds.
      const keepAliveStartedAt = Date.now();
      const keepAliveHandle = setInterval(() => {
        if (
          (spanReferenceForKeepAlive.transmitted && spanBuffer.isEmpty()) ||
          Date.now() - bullKeepAlive > keepAliveStartedAt
        ) {
          clearInterval(keepAliveHandle);
        }
      }, 100);
    }
    return originalProcessSend.apply(this, arguments);
  };
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
