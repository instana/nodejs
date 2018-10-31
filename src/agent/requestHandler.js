'use strict';

var semver = require('semver');

var logger = require('../logger').getLogger('agent/requestHandler');
var agentConnection = require('../agentConnection');

var actionMapping = {
  'node.source': require('../actions/source').getSourceFile,
  'node.getModuleAnalysis': require('../actions/getModuleAnalysis').getModuleAnalysis
};

if (semver.satisfies(process.versions.node, '>=4.0.0')) {
  var cpuProfiling = require('../actions/profiling/cpu');
  actionMapping['node.startCpuProfiling'] = cpuProfiling.startProfiling;
  actionMapping['node.stopCpuProfiling'] = cpuProfiling.stopProfiling;
}

exports.handleRequests = function(requests) {
  requests.forEach(handleRequest);
};

function handleRequest(request) {
  var action = actionMapping[request.action];
  if (!action) {
    sendResponse(request, { error: "Don't know how to handle action: " + action + '.' });
    return;
  }

  action(request, sendResponse.bind(null, request));
}

function sendResponse(request, response) {
  agentConnection.sendAgentResponseToAgent(request.messageId, response, function(error) {
    if (error) {
      logger.warn('Failed to send agent response for action %s and message ID %s', request.action, request.messageId, {
        error: error
      });
    }
  });
}

exports.activate = function() {
  /* noop */
};
exports.deactivate = function() {
  /* noop */
};
