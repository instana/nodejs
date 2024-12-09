'use strict';

const mochaOptions = {
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*'],
  watchFiles: ['test/**/*', '../*/src/**/*']
};

process.env.NODE_ENV = 'test';

module.exports = mochaOptions;
