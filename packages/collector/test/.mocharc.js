'use strict';

const mochaOptions = {
  file: ['test/initEnv.js'],
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*'],
  watchFiles: ['test/**/*.js', '../*/src/**/*.js', 'test/**/*.mjs', '../*/src/**/*.mjs']
};

process.env.NODE_ENV = 'test';
module.exports = mochaOptions;
