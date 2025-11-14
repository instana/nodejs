/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

exports.payloadPrefix = 'activeResources';

Object.defineProperty(exports, 'currentPayload', {
  get: function () {
    return process.getActiveResourcesInfo().length;
  }
});
