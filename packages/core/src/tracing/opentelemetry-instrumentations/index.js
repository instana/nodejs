/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

module.exports = {
  get otelInstrumentations() {
    return require('./wrap');
  },
  get otelCustomInstrumentations() {
    return require('./customTracing');
  }
};
