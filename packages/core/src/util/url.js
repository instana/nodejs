/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const url = require('url');
const secrets = require('../secrets');

/**
 * @param {string} urlString the URL that will be sanitized
 * @returns {string} the URL, without query parameters, matrix parameters and with basic auth credentials redacted
 */
exports.sanitizeUrl = function sanitizeUrl(urlString) {
  let normalizedUrl;
  try {
    // This currently uses the legacy URL API. As soon as we drop support for Node.js 6 we should move to the
    // WHATWG URL API (https://nodejs.org/api/url.html#url_the_whatwg_url_api).
    const p = url.parse(urlString);
    if (p.protocol == null && p.host == null && p.pathname == null) {
      return urlString;
    }

    normalizedUrl = `${nullToEmptyString(p.protocol)}${p.protocol != null || p.host != null ? '//' : ''}${
      p.auth != null ? '<redacted>:<redacted>@' : ''
    }${nullToEmptyString(p.host)}${nullToEmptyString(p.pathname)}`;
  } catch (e) {
    return urlString;
  }

  // url.parse does not take care of matrix params starting with ";", so we have to remove those manually.
  const indexOfSemicolon = getCharCountUntilOccurenceOfChar(normalizedUrl, ';');
  return normalizedUrl.substring(0, indexOfSemicolon);
};

/**
 * @param {string} string the string to normalize
 * @returns {string} returns the string unchanged, unless it is null or undefined, in that case an empty string is
 * returned
 */
function nullToEmptyString(string) {
  return string == null ? '' : string;
}

/**
 * @param {string} haystack the string in which to search for the needle
 * @param {string} needle the character to search for
 * @returns {number} the number of characters in haystack until the first occurence of needle or the length of haystack,
 * if haystack does not contain needle
 */
function getCharCountUntilOccurenceOfChar(haystack, needle) {
  const index = haystack.indexOf(needle);
  return index === -1 ? haystack.length : index;
}

/**
 * @param {string} queryString
 */
exports.filterParams = function filterParams(queryString) {
  if (!queryString || queryString === '') {
    return undefined;
  }
  if (typeof queryString !== 'string') {
    return queryString;
  }
  return queryString
    .split('&')
    .map(param => {
      const key = param.split('=')[0];
      if (key && secrets.isSecret(key)) {
        return `${key}=<redacted>`;
      }
      return param;
    })
    .join('&');
};
