'use strict';

const mochaOptions = {
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*', 'test/**/node_modules/.pnpm/**/*']
};

process.env.NODE_ENV = 'test';

module.exports = mochaOptions;
