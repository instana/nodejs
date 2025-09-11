/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const source = require('../actions/source');
const agentConnection = require('../agentConnection');
const getModuleAnalysis = require('../actions/getModuleAnalysis');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

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
  'node.source': source.getSourceFile,
  'node.getModuleAnalysis': getModuleAnalysis.getModuleAnalysis
};

/**
 * @param {import('@instana/core/src/config/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
  source.init(config);
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
      logger.warn(
        `Failed to send agent response for action ${request.action} and message ID ${request.messageId}.
        Error: ${error?.message} ${error?.stack}`
      );
    }
  });
}

exports.activate = function activate() {
  /* noop */
};
exports.deactivate = function deactivate() {
  /* noop */
};
