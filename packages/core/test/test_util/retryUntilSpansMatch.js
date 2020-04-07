'use strict';

const retry = require('./retry');

module.exports = exports = function retryUntilSpansMatch(agentControls, fn) {
  return retry(() => agentControls.getSpans().then(spans => fn(spans)));
};
