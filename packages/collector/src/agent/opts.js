'use strict';

// max time spend waiting for an agent response
exports.requestTimeout = 5000;
exports.host = '127.0.0.1';
exports.port = 42699;
exports.serverHeader = 'Instana Agent';
exports.agentUuid = undefined;

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
};
