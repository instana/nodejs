'use strict';

let qualifiedArn;

exports.init = function init(arnInfo) {
  qualifiedArn = arnInfo.arn;
};

exports.getHostHeader = function getHostHeader() {
  return qualifiedArn;
};

exports.getEntityId = function getEntityId() {
  return qualifiedArn;
};

exports.getFrom = function getFrom() {
  return {
    hl: true,
    cp: 'aws',
    e: qualifiedArn
  };
};
