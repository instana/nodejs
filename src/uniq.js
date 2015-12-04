'use strict';

module.exports = function uniq(arr) {
  if (arr.length < 2) {
    return arr;
  }

  arr.sort();

  var cleaned = [arr[0]];
  var previous = arr[0];
  for (var i = 1, len = arr.length; i < len; i++) {
    var val = arr[i];
    if (previous !== val) {
      previous = val;
      cleaned.push(val);
    }
  }

  return cleaned;
};
