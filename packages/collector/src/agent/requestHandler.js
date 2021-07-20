/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;

logger = require('../logger').getLogger('agent/requestHandler', newLogger => {
  logger = newLogger;
});

const agentConnection = require('../agentConnection');

/**
 * @typedef {Object} AnnounceRequest
 * @property {string} action
 * @property {string} messageId
 * @property {{file: string}} args
 */

/**
 * @typedef {(request: AnnounceRequest, multiCb: (data: Object.<string, *>) => void) => void} AgentAction
 */

/** @type {Object.<string, AgentAction>} */
const actionMapping = {
  'node.source': require('../actions/source').getSourceFile,
  'node.getModuleAnalysis': require('../actions/getModuleAnalysis').getModuleAnalysis
};

/**
 * @param {Array.<AnnounceRequest>} requests
 */
exports.handleRequests = function handleRequests(requests) {
  if (requests) {
    requests.forEach(handleRequest);
  }
};

/**
 * @param {AnnounceRequest} request
 * @returns
 */
function handleRequest(request) {
  const action = actionMapping[request.action];
  if (!action) {
    sendResponse(request, { error: `Don't know how to handle action: ${action}.` });
    return;
  }

  action(request, sendResponse.bind(null, request));
}

/**
 * @param {AnnounceRequest} request
 * @param {*} response
 */
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
