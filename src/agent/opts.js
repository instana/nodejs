'use strict';

// max time spend waiting for an agent response
exports.requestTimeout = 5000;
exports.host = '127.0.0.1';
exports.port = 42699;
exports.serverHeader = 'Instana Agent';
exports.agentUuid = undefined;
exports.extraHttpHeadersToCapture = [];

// Will be initalized lazily to avoid a dependency cycle
// secrets -> logger -> agent/bunyanToAgentStream -> agent/log -> agent/opts -> secrets.
// Until initialization has happend, everything is considered a secret (but init should happen before secret checking
// becomes relevant anyway).
exports.isSecret = function() {
  return true;
};

exports.init = function init(config) {
  if (config.agentHost) {
    exports.host = config.agentHost;
  } else if (process.env.INSTANA_AGENT_HOST) {
    exports.host = process.env.INSTANA_AGENT_HOST;
  }

  if (config.agentPort) {
    exports.port = config.agentPort;
  }
  if (process.env.INSTANA_AGENT_PORT) {
    exports.port = process.env.INSTANA_AGENT_PORT;
  }

  if (config.agentName) {
    exports.serverHeader = config.agentName;
  } else if (process.env.INSTANA_AGENT_NAME) {
    exports.serverHeader = process.env.INSTANA_AGENT_NAME;
  }

  exports.isSecret = require('../secrets').defaultMatcher;
};
