/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const revision = process.env.K_REVISION;
const host = `gcp:cloud-run:revision:${revision}`;
let containerInstanceId;

exports.init = function init(containerInstanceId_) {
  containerInstanceId = containerInstanceId_;
};

exports.getHostHeader = function getHostHeader() {
  return host;
};

exports.getRevision = function getRevision() {
  return revision;
};

exports.getContainerInstanceId = function getContainerInstanceId() {
  return containerInstanceId;
};

exports.getEntityId = function getEntityId() {
  return containerInstanceId;
};

exports.getFrom = function getFrom() {
  return {
    hl: true,
    cp: 'gcp',
    e: containerInstanceId
  };
};
