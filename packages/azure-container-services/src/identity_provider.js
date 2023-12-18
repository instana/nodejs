/*
 * (c) Copyright IBM Corp. 2023
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
    cp: 'azure',
    e: entityId
  };
};

function extractEntityId() {
  const websiteOwner = process.env.WEBSITE_OWNER_NAME;
  const subscriptionId = websiteOwner && websiteOwner.split('+')[0];
  const resourceGroup = process.env.WEBSITE_RESOURCE_GROUP;
  const appName = process.env.WEBSITE_SITE_NAME;
  if (subscriptionId && resourceGroup && appName) {
    entityId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${appName}`;
  }
  return entityId;
}
