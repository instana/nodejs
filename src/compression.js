'use strict';

module.exports = function applyCompressionRoot(prev, next) {
  var result = applyCompression(prev, next);

  // the root object needs to be at least an empty object.
  if (result === undefined) {
    return {};
  }
  return result;
};

function applyCompression(prev, next) {
  if (prev === next) {
    return undefined;
  }

  var pType = typeof prev;
  var nType = typeof next;

  if (pType !== nType) {
    return next;
  } else if (next instanceof Array) {
    return applyCompressionToArray(prev, next);
  } else if (nType === 'object') {
    return applyCompressionToObject(prev, next);
  } else if (prev !== next) {
    return next;
  }

  return undefined;
}

function applyCompressionToObject(prev, next) {
  var result = {};
  var addedProps = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (var nKey in next) {
    // eslint-disable-next-line no-prototype-builtins
    if (next.hasOwnProperty(nKey)) {
      var nValue = next[nKey];
      var pValue = prev[nKey];

      var compressed = applyCompression(pValue, nValue);
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

function applyCompressionToArray(prev, next) {
  if (next.length !== prev.length) {
    return next;
  }

  var hasChanges = false;

  for (var i = 0, len = next.length; i < len && !hasChanges; i++) {
    hasChanges = prev[i] !== next[i];
  }

  if (hasChanges) {
    return next;
  }
  return undefined;
}
