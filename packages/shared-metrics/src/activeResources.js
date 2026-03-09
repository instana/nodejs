/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

exports.payloadPrefix = 'activeResources';
Object.defineProperty(exports, 'currentPayload', {
  get: function () {
    // eslint-disable-next-line no-console
    console.log('getActiveResourcesInfo;', process.getActiveResourcesInfo());
    return {
      count: process.getActiveResourcesInfo().length
    };
  }
});
