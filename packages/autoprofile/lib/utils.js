/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

// @ts-nocheck

'use strict';

const crypto = require('crypto');

class Utils {
  constructor(profiler) {
    this.profiler = profiler;
  }

  millis() {
    return Date.now();
  }

  timestamp() {
    return Math.floor(Date.now() / 1000);
  }

  generateUuid() {
    return crypto.randomBytes(16).toString('hex');
  }
}

exports.Utils = Utils;
