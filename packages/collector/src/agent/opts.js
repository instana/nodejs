'use strict';

// max time spend waiting for an agent response
exports.requestTimeout = 5000;
exports.host = '127.0.0.1';
exports.port = 42699;
exports.serverHeader = 'Instana Agent';
exports.agentUuid = undefined;

exports.init = function init(config) {
  exports.host = config.agentHost;
  exports.port = config.agentPort;
  exports.serverHeader = config.agentName;
};
