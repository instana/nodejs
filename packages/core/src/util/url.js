/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const { URL } = require('url');
const secrets = require('../secrets');

/**
 * Sanitizes the incoming URL by removing query parameters and redacting basic auth credentials if present.
 * @param {string} urlString the URL that will be sanitized
 * @returns {string} the URL, without query parameters, matrix parameters and with basic auth credentials redacted
 */
exports.sanitizeUrl = function sanitizeUrl(urlString) {
  let normalizedUrl;
  try {
    const url = new URL(urlString);

    // If URL has no protocol, host, or path, return the original URL.
    // TODO: This case need adjustment for complete sanitization of the URL.
    if (!url.protocol && !url.host && !url.pathname) {
      return urlString;
    }

    // Normalize the URL with redacted credentials.
    normalizedUrl = `${nullToEmptyString(url.protocol)}${url.protocol || url.host ? '//' : ''}${
      url.username || url.password ? '<redacted>:<redacted>@' : ''
    }${nullToEmptyString(url.host)}${nullToEmptyString(url.pathname)}`;
  } catch (e) {
    // If URL parsing fails and it's a relative URL, return its path.
    // For example, if the input is "/foo?a=b", the returned value will be "/foo".
    if (typeof urlString === 'string' && urlString.startsWith('/')) {
      return new URL(urlString, 'https://example.org/').pathname;
    } else {
      // This case  need adjustment for complete sanitization of the URL, reference 159741
      return urlString;
    }
  }
  return normalizedUrl;
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

/**
 * Splits the given string (a URL) at the first occurence of the question mark character, then treats the second half as
 * a query string, applies secrets redaction to it and returns that query string with secrets redacted.
 *
 * @param {string} fullUrl the URL from the query string is to be extracted
 */
exports.splitAndFilter = function splitAndFilter(fullUrl) {
  const parts = fullUrl.split('?');
  if (parts.length >= 2) {
    return exports.filterParams(parts[1]);
  }
  return null;
};

/**
 * Returns a new string which is the input with the first character removed if and only if that character is a question
 * mark, otherwise this function returns the input unchanged.
 *
 * @param {string} queryString the string from which the first character will be conditionally be removed
 */
exports.dropLeadingQuestionMark = function dropLeadingQuestionMark(queryString) {
  if (queryString && queryString.charAt(0) === '?') {
    return queryString.substring(1);
  }
  return queryString;
};
