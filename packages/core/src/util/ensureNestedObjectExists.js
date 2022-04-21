/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * mkdir -p for objects.
 *
 * @param {Object} object
 * @param {Array.<string>} pathInObject
 */
module.exports = function ensureNestedObjectExists(object, pathInObject) {
  const [head, ...tail] = pathInObject;
  // @ts-ignore
  if (!object[head]) {
    // @ts-ignore
    object[head] = {};
  }
  if (tail.length >= 1) {
    // @ts-ignore
    ensureNestedObjectExists(object[head], tail);
  }
};
