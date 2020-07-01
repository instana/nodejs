'use strict';

var logger;
logger = require('../logger').getLogger('agent/requestHandler', function(newLogger) {
  logger = newLogger;
});

var agentConnection = require('../agentConnection');

var actionMapping = {
  'node.source': require('../actions/source').getSourceFile,
  'node.getModuleAnalysis': require('../actions/getModuleAnalysis').getModuleAnalysis
};

exports.handleRequests = function(requests) {
  if (requests) {
    requests.forEach(handleRequest);
  }
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
