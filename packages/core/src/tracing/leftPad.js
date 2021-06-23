/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// A modified copy (optimized for our particular use case) of
// https://github.com/stevemao/left-pad/blob/master/index.js, copyright (c) 2018 Steve Mao.
// The original work is subject to the MIT license, as is the whole @instana/core package, see the LICENSE
// file in the root directory of this package.

module.exports = leftPad;

// Even with 128 bit trace IDs we will only ever want to pad to max 32 characters, so keep a cache of the padding
// strings for padding lengths 0 to 32.
const cache = [
  '',
  '0',
  '00',
  '000',
  '0000',
  '00000',
  '000000',
  '0000000',
  '00000000',
  '000000000',
  '0000000000',
  '00000000000',
  '000000000000',
  '0000000000000',
  '00000000000000',
  '000000000000000',
  '0000000000000000',
  '00000000000000000',
  '000000000000000000',
  '0000000000000000000',
  '00000000000000000000',
  '000000000000000000000',
  '0000000000000000000000',
  '00000000000000000000000',
  '000000000000000000000000',
  '0000000000000000000000000',
  '00000000000000000000000000',
  '000000000000000000000000000',
  '0000000000000000000000000000',
  '00000000000000000000000000000',
  '000000000000000000000000000000',
  '0000000000000000000000000000000',
  '00000000000000000000000000000000'
];
/**
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
function leftPad(str, len) {
  // use '0' as the padding char, always
  let ch = '0';
  // `len` is the `pad`'s length now
  len -= str.length;
  // doesn't need to pad
  if (len <= 0) return str;
  // use cached/precreated padding strings for common use cases (up to length 32)
  if (len < 33) return cache[len] + str;
  // `pad` starts with an empty string
  let pad = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // add `ch` to `pad` if `len` is odd
    // eslint-disable-next-line no-bitwise
    if (len & 1) pad += ch;
    // divide `len` by 2, ditch the remainder
    // eslint-disable-next-line no-bitwise
    len >>= 1;
    // "double" the `ch` so this operation count grows logarithmically on `len`
    // each time `ch` is "doubled", the `len` would need to be "doubled" too
    // similar to finding a value in binary search tree, hence O(log(n))
    if (len) ch += ch;
    // `len` is 0, exit the loop
    else break;
  }
  // pad `str`
  return pad + str;
}
