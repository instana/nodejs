/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

exports.payloadPrefix = 'activeRequests';

Object.defineProperty(exports, 'currentPayload', {
  get: function () {
    // TODO: _getActiveRequests is deprecated. Replace with getActiveResourcesInfo.
    //       https://nodejs.org/api/deprecations.html#dep0161-process_getactiverequests-and-process_getactivehandles
    //       Added in v16.
    // refs https://jsw.ibm.com/browse/INSTA-64277
    // @ts-ignore
    return process._getActiveRequests().length;
  }
});
