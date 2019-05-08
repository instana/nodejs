'use strict';

let unqualifiedArn = 'unknown-nodejs-aws-lambda';
let version = 'unknown-version';
let qualifiedArn = `${unqualifiedArn}:${version}`;

exports.init = function init(context) {
  unqualifiedArn = safe(context.invokedFunctionArn, unqualifiedArn);
  version = safe(context.functionVersion, version);
  qualifiedArn = `${unqualifiedArn}:${version}`;
};

exports.getHostHeader = function getHostHeader() {
  return unqualifiedArn;
};

exports.getEntityId = function getEntityId() {
  return qualifiedArn;
};

exports.getFrom = function getFrom() {
  return {
    e: qualifiedArn
  };
};

function safe(s, fallback) {
  if (s == null || typeof s !== 'string') {
    if (fallback != null) {
      return fallback;
    }
    return 'unknown';
  }
  return s;
}
