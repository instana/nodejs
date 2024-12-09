'use strict';

const mochaOptions = {
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*'],
  watchFiles: ['test/**/*', '../*/src/**/*']
};

module.exports = mochaOptions;
