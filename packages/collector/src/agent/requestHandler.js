/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

let logger;
logger = require('../logger').getLogger('agent/requestHandler', newLogger => {
  logger = newLogger;
});

const agentConnection = require('../agentConnection');

const actionMapping = {
  'node.source': require('../actions/source').getSourceFile,
  'node.getModuleAnalysis': require('../actions/getModuleAnalysis').getModuleAnalysis
};

exports.handleRequests = function handleRequests(requests) {
  if (requests) {
    requests.forEach(handleRequest);
  }
};

function handleRequest(request) {
  const action = actionMapping[request.action];
  if (!action) {
    sendResponse(request, { error: `Don't know how to handle action: ${action}.` });
    return;
  }

  action(request, sendResponse.bind(null, request));
}

function sendResponse(request, response) {
  agentConnection.sendAgentResponseToAgent(request.messageId, response, error => {
    if (error) {
      logger.warn('Failed to send agent response for action %s and message ID %s', request.action, request.messageId, {
        error
      });
    }
  });
}

exports.activate = function activate() {
  /* noop */
};
exports.deactivate = function deactivate() {
  /* noop */
};
