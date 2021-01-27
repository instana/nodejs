/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

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
