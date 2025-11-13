/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

exports.payloadPrefix = 'activeResources';

Object.defineProperty(exports, 'currentPayload', {
  get: function () {
    return process.getActiveResourcesInfo().length;
  }
});
