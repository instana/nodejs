'use strict';

const mochaOptions = {
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*'],
  watchFiles: ['test/**/*.{js,mjs}', '../*/src/**/*.{js,mjs}'],
  'watch-ignore': ['test/**/node_modules']
};

process.env.NODE_ENV = 'test';

module.exports = mochaOptions;
