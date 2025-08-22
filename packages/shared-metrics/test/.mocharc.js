'use strict';

const mochaOptions = {
  ignore: ['node_modules/**/*', 'test/**/node_modules/**/*'],
  'watch-ignore': ['test/**/node_modules/**/*']
};

process.env.NODE_ENV = 'test';
module.exports = mochaOptions;
