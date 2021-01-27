/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

exports.readHeaderKeyValuePairCaseInsensitive = function readHeaderKeyValuePairCaseInsensitive(headers, key) {
  if (!headers || typeof headers !== 'object' || typeof key !== 'string') {
    return undefined;
  }
  const headerKeys = Object.keys(headers);
  for (let i = 0; i < headerKeys.length; i++) {
    if (headerKeys[i] && headerKeys[i].toLowerCase() === key.toLowerCase()) {
      return { key: headerKeys[i], value: headers[headerKeys[i]] };
    }
  }
  return undefined;
};
