'use strict';

exports.payloadPrefix = 'activeRequests';

exports.activate = function() {};
exports.deactivate = function() {};

Object.defineProperty(exports, 'currentPayload', {
  get: function() {
    return process._getActiveRequests().length;
  }
});
