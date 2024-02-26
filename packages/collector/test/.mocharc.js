'use strict';

const mochaOptions = {
  file: ['test/initEnv.js'],
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*']
};

// To address the certificate authorization issue with node-fetch, process.env.NODE_TLS_REJECT_UNAUTHORIZED
// was set to '0'. Refer to the problem discussed in https://github.com/node-fetch/node-fetch/issues/19
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_ENV = 'test';

if (process.env.CI) {
  // Retry failed tests once on CI.
  mochaOptions.retries = 1;
}

module.exports = mochaOptions;
