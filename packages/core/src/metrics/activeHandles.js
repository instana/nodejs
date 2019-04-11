'use strict';

exports.payloadPrefix = 'activeHandles';

Object.defineProperty(exports, 'currentPayload', {
  get: function() {
    return process._getActiveHandles().length;
  }
});
