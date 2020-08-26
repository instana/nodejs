'use strict';

module.exports = function uniq(arr) {
  if (arr.length < 2) {
    return arr;
  }

  arr.sort();

  const cleaned = [arr[0]];
  let previous = arr[0];
  for (let i = 1, len = arr.length; i < len; i++) {
    const val = arr[i];
    if (previous !== val) {
      previous = val;
      cleaned.push(val);
    }
  }

  return cleaned;
};
