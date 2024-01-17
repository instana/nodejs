'use strict';

const mochaOptions = {
  // file: ['test/initEnv.js']
};

process.env.NODE_ENV = 'test';

if (process.env.CI) {
  // Retry failed tests once on CI.
  mochaOptions.retries = 1;
}

module.exports = mochaOptions;
