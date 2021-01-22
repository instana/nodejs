/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

/**
 * Calculates the size of the given object's properties when serialized to JSON.
 */
module.exports = function propertySizes(object, prefix) {
  if (prefix == null) {
    prefix = '';
  }
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
