/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

module.exports = {
  get init() {
    return require('./wrap').init;
  },
  get preInit() {
    return require('./wrap').preInit;
  }
};
