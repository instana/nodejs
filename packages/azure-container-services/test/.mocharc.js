'use strict';

const mochaOptions = {};

if (process.env.CI) {
  // Retry failed tests once on CI.
  mochaOptions.retries = 1;
}

module.exports = mochaOptions;