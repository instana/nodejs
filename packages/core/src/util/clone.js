/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

/**
 * @param {Object<string, *>|Array<Object>} x
 * @returns {Object<string, *>}
 */
module.exports = function clone(x) {
  /** @type {Object<string, *>} */
  let r;
  if (x === null || x === undefined) {
    return x;
  }

  if (x.constructor === Array) {
    r = [];

    for (let i = 0, n = x.length; i < n; i++) {
      r[i] = clone(x[i]);
    }

    return r;
  }

  if (typeof x === 'object') {
    r = {};

    // eslint-disable-next-line no-restricted-syntax
    for (const key in x) {
      // eslint-disable-next-line no-prototype-builtins
      if (x.hasOwnProperty(key)) {
        r[key] = clone(/** @type {Object<string, *>} */ (x)[key]);
      }
    }

    return r;
  }

  return x;
};
