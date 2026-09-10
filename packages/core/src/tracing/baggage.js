/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {string | null} raw
 * @returns {Record<string, string>}
 */
function parseBaggageHeader(raw) {
  if (!raw) {
    return /** @type {Record<string, string>} */ ({});
  }

  /** @type {Record<string, string>} */
  const result = {};
  const members = raw.split(',');

  for (let i = 0; i < members.length; i++) {
    const member = members[i].trim();
    if (!member) {
      continue;
    }

    const withoutProps = member.split(';')[0].trim();
    const eqIdx = withoutProps.indexOf('=');
    if (eqIdx < 1) {
      continue;
    }

    const key = withoutProps.substring(0, eqIdx).trim();
    const value = decodeURIComponent(withoutProps.substring(eqIdx + 1).trim());
    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * @param {Record<string, string>} entries
 * @returns {string}
 */
function renderBaggageHeader(entries) {
  return Object.keys(entries)
    .map(k => `${k}=${encodeURIComponent(entries[k])}`)
    .join(',');
}

/**
 * @param {string | null} rawBaggage
 * @param {string[]} captureKeys
 * @param {Record<string, string>} tags
 */
function applyCaptureTags(rawBaggage, captureKeys, tags) {
  if (!rawBaggage || !captureKeys || captureKeys.length === 0) {
    return;
  }

  const parsed = parseBaggageHeader(rawBaggage);

  for (let i = 0; i < captureKeys.length; i++) {
    const key = captureKeys[i];
    if (parsed[key] !== undefined && tags[key] === undefined) {
      tags[key] = parsed[key];
    }
  }
}

module.exports = {
  parseBaggageHeader,
  renderBaggageHeader,
  applyCaptureTags
};
