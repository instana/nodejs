'use strict';

const mochaOptions = {
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*']
};
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_ENV = 'test';

if (process.env.CI) {
  // Retry failed tests once on CI.
  mochaOptions.retries = 1;
}

module.exports = mochaOptions;
