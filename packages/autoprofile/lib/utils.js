/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

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

  generateSha1(text) {
    const h = crypto.createHash('sha1');
    h.update(text);
    return h.digest('hex');
  }
}

exports.Utils = Utils;
