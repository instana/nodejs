/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

function extractEntityId() {
  return String(process.pid);
}

let entityId;
exports.init = function init() {
  entityId = extractEntityId();
};

exports.getHostHeader = function getHostHeader() {
  // default is "nodejs-serverless" - see packages/serverless/src/backend_connector.js#81
  return null;
};

exports.getEntityId = function getEntityId() {
  return entityId;
};

exports.getFrom = function getFrom() {
  return {
    hl: true,
    e: entityId
  };
};
