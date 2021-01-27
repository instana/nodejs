/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const defaultUnqualifiedArn = 'arn:aws:lambda:unknown-region:unknown-id:function:unknown-name';
const defaultVersion = '$LATEST';

// arn:aws:lambda:$region:$id:function:$name[:$alias]
const arnRegex = /^(arn:aws:lambda:[^:]+:[^:]+:function:[^:]+)(?::([^:]+))?$/;

module.exports = exports = function parseArn(context) {
  const invokedFunctionArn = safe(context.invokedFunctionArn, defaultUnqualifiedArn);
  const version = safe(context.functionVersion, defaultVersion);
  const match = arnRegex.exec(invokedFunctionArn);
  if (!match || match[2] == null) {
    return {
      arn: `${invokedFunctionArn}:${version}`
    };
  } else {
    return {
      arn: `${match[1]}:${version}`,
      alias: match[2]
    };
  }
};

function safe(s, fallback) {
  if (s == null || typeof s !== 'string') {
    return fallback;
  }
  return s;
}
