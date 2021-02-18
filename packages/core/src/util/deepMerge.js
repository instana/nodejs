/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * Does a deep merge on two objects, that is, nested objects are merged recursively. Array attributes are not merged,
 * though.
 *
 * The source object takes precedence over target in case of conflicts. A conflict exists if there is a property with
 * the same path in both objects that can not be merged, that is, at least one of the values is not an object.
 *
 * Note that target might be modified by this function. Usually target is returned, but in some edge cases (notably
 * target being null or undefined) source may be returned.
 */

/**
 * @param {*} target
 * @param {*} source
 */
module.exports = function deepMerge(target, source) {
  if (target == null && source != null) {
    return source;
  }

  if (isObject(target) && isObject(source)) {
    for (let i = 0; i < Object.keys(source).length; i++) {
      const key = Object.keys(source)[i];
      if (source[key] == null && target[key] != null) {
        // nothing to do, keep target[key] in place instead of overwriting it with null/undefined
      } else if (target[key] == null || !isObject(source[key]) || !isObject(target[key])) {
        // attribute does not exist in target or values are not mergable, overwrite attribute in target
        target[key] = source[key];
      } else {
        // attribute exists in both, source and target, and values are mergable
        deepMerge(target[key], source[key]);
      }
    }
  }

  return target;
};

/**
 * @param {*} value
 */
function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
