'use strict';

// max time spend waiting for an agent response
exports.requestTimeout = 5000;
exports.host = '127.0.0.1';
exports.port = 42699;
exports.serverHeader = 'Instana Agent';
exports.agentUuid = undefined;


exports.init = function init(config) {
  if (process.env.INSTANA_AGENT_IP) {
    exports.host = process.env.INSTANA_AGENT_IP;
  } else if (config.agentHost) {
    exports.host = config.agentHost;
  }

  if (process.env.INSTANA_AGENT_PORT) {
    exports.port = process.env.INSTANA_AGENT_PORT;
  } else if (config.agentPort) {
    exports.port = config.agentPort;
  }

  if (process.env.INSTANA_AGENT_NAME) {
    exports.serverHeader = process.env.INSTANA_AGENT_NAME;
  } else if (config.agentName) {
    exports.serverHeader = config.agentName;
  }
};
