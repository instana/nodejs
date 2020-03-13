'use strict';

exports.payloadPrefix = 'activeRequests';

Object.defineProperty(exports, 'currentPayload', {
  get: function() {
    return process._getActiveRequests().length;
  }
});
