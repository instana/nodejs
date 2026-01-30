/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

module.exports = {
  get otelInstrumentations() {
    return require('./wrap');
  },
  get preloadOtelInstrumentations() {
    return require('./instrumentations').preloadOtelInstrumentations;
  },
  get getInstrumentationPackageNames() {
    return require('./instrumentations').getInstrumentationPackageNames;
  }
};
