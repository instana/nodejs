'use strict';

/**
 * Calculates the size of the given object's properties when serialized to JSON.
 */
module.exports = function propertySizes(object, prefix) {
  if (prefix == null) {
    prefix = '';
  }
  var sizes = [];
  Object.keys(object).forEach(function(property) {
    var value = object[property];
    if (value == null) {
      return;
    }
    if (!Array.isArray(value) && typeof value === 'object') {
      sizes = sizes.concat(propertySizes(value, prefix + property + '.'));
      return;
    }
    var serializedProperty = JSON.stringify(object[property]);
    sizes.push({
      property: prefix + property,
      length: serializedProperty ? serializedProperty.length : 0
    });
  });
  return sizes;
};
