/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

/**
 * @param {Object<string, *>} prev
 * @param {Object<string, *>} next
 * @param {Array<*>} [excludeList]
 * @returns {Object<string, *>}
 */
module.exports = function applyCompressionRoot(prev, next, excludeList) {
  const result = applyCompression([], prev, next, excludeList);

  // the root object needs to be at least an empty object.
  if (result === undefined) {
    return {};
  }
  return result;
};

/**
 * @param {Array<*>} path
 * @param {Object<string, *>} prev
 * @param {Object<string, *>} next
 * @param {*} excludeList
 * @return {Object<string, *>}
 */
function applyCompression(path, prev, next, excludeList) {
  if (isExcluded(path, excludeList)) {
    return next;
  }

  if (excludeList == null && prev === next) {
    // Shortcut: If it is the same object, remove it completely. We can only take this shortcut safely, if there is no
    // excludeList, otherwise we might accidentally remove attributes that would be excluded for compression.
    return undefined;
  }

  const pType = typeof prev;
  const nType = typeof next;

  if (pType !== nType) {
    return next;
  } else if (Array.isArray(next)) {
    return applyCompressionToArray(prev, next);
  } else if (nType === 'object') {
    return applyCompressionToObject(path, prev, next, excludeList);
  } else if (prev !== next) {
    return next;
  }

  return undefined;
}

/**
 * @param {Array<*>} path
 * @param {Object<string, *>} prev
 * @param {Object<string, *>} next
 * @param {Array<*>} excludeList
 * @return {Object<string, *>}
 */
function applyCompressionToObject(path, prev, next, excludeList) {
  /** @type {Object<string, *>} */
  const result = {};
  let addedProps = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (const nKey in next) {
    // eslint-disable-next-line no-prototype-builtins
    if (next.hasOwnProperty(nKey)) {
      const nValue = next[nKey];
      const pValue = prev[nKey];

      const compressed = applyCompression(path.concat(nKey), pValue, nValue, excludeList);
      if (compressed !== undefined) {
        result[nKey] = compressed;
        addedProps++;
      }
    }
  }

  if (addedProps > 0) {
    return result;
  }

  return undefined;
}

/**
 * @param {Object<string, *>} prev
 * @param {Object<string, *>} next
 */
function applyCompressionToArray(prev, next) {
  if (next.length !== prev.length) {
    return next;
  }

  let hasChanges = false;

  for (let i = 0, len = next.length; i < len && !hasChanges; i++) {
    hasChanges = prev[i] !== next[i];
  }

  if (hasChanges) {
    return next;
  }
  return undefined;
}

/**
 * @param {Array<*>} path
 * @param {Array<*>} excludeList
 * @returns {boolean}
 */
function isExcluded(path, excludeList) {
  if (excludeList == null) {
    return false;
  }

  // Compare the given path to all excludeList entries.
  // eslint-disable-next-line no-restricted-syntax
  outer: for (let i = 0; i < excludeList.length; i++) {
    if (excludeList[i].length !== path.length) {
      // The excludeList entry and then given path have different lengths, this cannot be a match. Continue with next
      // excludeList entry.
      continue;
    }
    for (let j = 0; j < excludeList[i].length; j++) {
      if (excludeList[i][j] !== path[j]) {
        // We found a path segment that is differnt for this excludeList entry and then given path, this cannot be a
        // match. Continue with next excludeList entry.
        continue outer;
      }
    }
    // This excludeList entry and the given path have the same number of segments and all segments are identical, so
    // this is a match, that is, this path has been excludeListed for compression.
    return true;
  }
  return false;
}
