/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = function (redis, log) {
  const setupType = process.env.REDIS_SETUP_TYPE;

  switch (setupType) {
    case 'cluster':
      return require('./cluster')(redis, log);
    case 'sentinel':
      return require('./sentinel')(redis, log);
    case 'pool':
      return require('./pool')(redis, log);
    default:
      return require('./default')(redis, log);
  }
};
