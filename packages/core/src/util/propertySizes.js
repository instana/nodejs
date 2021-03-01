/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * @typedef {Object} PropertySize
 * @property {string} property
 * @property {number} length
 */

/**
 * Calculates the size of the given object's properties when serialized to JSON.
 * @param {Object.<string, *>} object
 * @param {string} [prefix]
 */
module.exports = function propertySizes(object, prefix) {
  if (prefix == null) {
    prefix = '';
  }

  /** @type {Array<PropertySize>} */
  let sizes = [];
  Object.keys(object).forEach(property => {
    const value = object[property];
    if (value == null) {
      return;
    }
    if (!Array.isArray(value) && typeof value === 'object') {
      sizes = sizes.concat(propertySizes(value, `${prefix + property}.`));
      return;
    }
    const serializedProperty = JSON.stringify(object[property]);
    sizes.push({
      property: prefix + property,
      length: serializedProperty ? serializedProperty.length : 0
    });
  });
  return sizes;
};
