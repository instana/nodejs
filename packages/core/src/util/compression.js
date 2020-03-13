'use strict';

module.exports = exports = function applyCompressionRoot(prev, next, blacklist) {
  var result = applyCompression([], prev, next, blacklist);

  // the root object needs to be at least an empty object.
  if (result === undefined) {
    return {};
  }
  return result;
};

function applyCompression(path, prev, next, blacklist) {
  if (isBlacklisted(path, blacklist)) {
    return next;
  }

  if (blacklist == null && prev === next) {
    // Shortcut: If it is the same object, remove it completely. We can only take this shortcut safely, if there is no
    // blacklist, otherwise we might accidentally remove attributes that would be blacklisted for compression.
    return undefined;
  }

  var pType = typeof prev;
  var nType = typeof next;

  if (pType !== nType) {
    return next;
  } else if (Array.isArray(next)) {
    return applyCompressionToArray(prev, next);
  } else if (nType === 'object') {
    return applyCompressionToObject(path, prev, next, blacklist);
  } else if (prev !== next) {
    return next;
  }

  return undefined;
}

function applyCompressionToObject(path, prev, next, blacklist) {
  var result = {};
  var addedProps = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (var nKey in next) {
    // eslint-disable-next-line no-prototype-builtins
    if (next.hasOwnProperty(nKey)) {
      var nValue = next[nKey];
      var pValue = prev[nKey];

      var compressed = applyCompression(path.concat(nKey), pValue, nValue, blacklist);
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

function isBlacklisted(path, blacklist) {
  if (blacklist == null) {
    return false;
  }

  // Compare the given path to all blacklist entries.
  // eslint-disable-next-line no-restricted-syntax
  outer: for (var i = 0; i < blacklist.length; i++) {
    if (blacklist[i].length !== path.length) {
      // The blacklist entry and then given path have different lengths, this cannot be a match. Continue with next
      // blacklist entry.
      // eslint-disable-next-line no-continue
      continue;
    }
    for (var j = 0; j < blacklist[i].length; j++) {
      if (blacklist[i][j] !== path[j]) {
        // We found a path segment that is differnt for this blacklist entry and then given path, this cannot be a
        // match. Continue with next blacklist entry.
        // eslint-disable-next-line no-continue
        continue outer;
      }
    }
    // This blacklist entry and the given path have the same number of segments and all segments are identical, so this
    // is a match, that is, this path has been blacklisted for compression.
    return true;
  }
  return false;
}
