/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

exports.payloadPrefix = 'activeHandles';

Object.defineProperty(exports, 'currentPayload', {
  get: function () {
    // @ts-ignore
    return process._getActiveHandles().length;
  }
});
