'use strict';

var agentOpts = require('../../../agent/opts');

exports.getExtraHeaders = function getExtraHeaders(incomingMessage) {
  if (!agentOpts.extraHttpHeadersToCapture || agentOpts.extraHttpHeadersToCapture.length === 0) {
    return undefined;
  }

  var extraHeaders = {};
  for (var i = 0; i < agentOpts.extraHttpHeadersToCapture.length; i++) {
    var key = agentOpts.extraHttpHeadersToCapture[i];
    var value = incomingMessage.headers[key];
    if (value) {
      extraHeaders[key] = value;
    }
  }
  return extraHeaders;
};
