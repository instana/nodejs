'use strict';

const mochaOptions = {
  file: ['test/initEnv.js'],
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*'],
  'watch-ignore': ['test/**/node_modules/**/*', 'test/**/_v*/**']
};

process.env.NODE_ENV = 'test';
module.exports = mochaOptions;
