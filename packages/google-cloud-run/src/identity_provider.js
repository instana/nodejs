'use strict';

const revision = process.env.K_REVISION;
let containerInstanceId;

exports.init = function init(containerInstanceId_) {
  containerInstanceId = containerInstanceId_;
};

exports.getHostHeader = function getHostHeader() {
  return revision;
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
