/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

module.exports = function isCI() {
  // Alternatively, we could use https://www.npmjs.com/package/is-ci if we ever start using a CI system where the CI
  // environment variable is not set. So far, this simple check is good enough.
  return !!process.env.CI;
};
