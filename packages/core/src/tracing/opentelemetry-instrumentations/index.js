/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

module.exports = {
  get init() {
    return require('./wrap').init;
  },
  get preload() {
    return require('./instrumentations').preload;
  }
};
