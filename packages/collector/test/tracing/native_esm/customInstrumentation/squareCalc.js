/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { EXIT } = require('@instana/core').tracing.constants;
const tracingUtil = require('../../../../../core/src/tracing/tracingUtil');
const cls = require('../../../../../core/src/tracing/cls');
const hook = require('@instana/core').coreUtils.hook;
// eslint-disable-next-line no-unused-vars
let isActive = false;

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

exports.init = function init() {
  hook.onModuleLoad('square-calc', instrument, { nativeEsm: true });
};

/**
 * Instruments the 'calculateSquare' method of the 'square-calc' module.
 * @param {{ calculateSquare: (...args: any[]) => undefined; }} orgModule - The original module.
 */
function instrument(orgModule) {
  const originalCalculateSquare = orgModule;

  orgModule = function () {
    const number = arguments[0];
    if (cls.skipExitTracing({ isActive })) {
      return originalCalculateSquare.apply(this, arguments);
    }
    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan({
        spanName: 'square-calc',
        kind: EXIT
      });
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(instrument, 1);

      try {
        const result = originalCalculateSquare.apply(this, arguments);
        span.d = Date.now() - span.ts;
        span.data.calculator = { number, method: 'calculateSquare' };
        span.transmit();
        return result;
      } catch (err) {
        span.ec = 1;
        span.data.calculator.error = err.message;
        span.d = Date.now() - span.ts;
        span.transmit();
        throw err;
      }
    }, null);
  };

  return orgModule;
}
