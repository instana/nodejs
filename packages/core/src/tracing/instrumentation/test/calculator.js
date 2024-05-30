/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/* eslint-disable no-unused-vars */
const shimmer = require('../../shimmer');
const { EXIT } = require('../../constants');
const tracingUtil = require('../../tracingUtil');
const cls = require('../../cls');
const iitmHook = require('../../../util/iitmHook');

let active = false;

/* eslint-disable no-console */

exports.activate = function activate() {
  active = true;
};

exports.deactivate = function deactivate() {
  active = false;
};

exports.init = function init() {
  iitmHook.onModuleLoad('esm-square-calculator', instrument);
};

/**
 * @param {{ calculateSquare: (...args: any[]) => undefined; }} orgModule
 */
function instrument(orgModule) {
  const originalCalculateSquare = orgModule.calculateSquare;

  orgModule.calculateSquare = function () {
    const number = arguments[0];
    console.log(`Calculating the square of ${number}`);

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan('calculator', EXIT, null, null);
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

module.exports.instrument = instrument;
