/* global WeakSet */

'use strict';

module.exports = exports = function createCircularReferencesRemover() {
  var seen = new WeakSet();
  return function(_, value) {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};
