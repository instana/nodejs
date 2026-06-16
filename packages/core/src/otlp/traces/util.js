/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Fast interceptor to identify log frames on the hot path
 */
function isLogSpan(span) {
  if (!span) return false;
  if (span.data && span.data.log) return true;
  if (span.n && typeof span.n === 'string' && span.n.startsWith('log.')) return true;
  return false;
}

module.exports = {
  isLogSpan
};
