/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

let entityId;
exports.init = function init() {
  entityId = extractEntityId();
};

exports.getHostHeader = function getHostHeader() {
  return entityId;
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

function extractEntityId() {
  return String(process.pid);
}
