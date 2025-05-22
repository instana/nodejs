/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = function (redis, log) {
  if (process.env.REDIS_POOL === 'true') {
    return require('./pool')(redis, log);
  }

  const setupType = process.env.REDIS_SETUP_TYPE;

  if (setupType === 'cluster') {
    return require('./cluster')(redis, log);
  }

  if (setupType === 'sentinel') {
    return require('./sentinel')(redis, log);
  }

  return require('./default')(redis, log);
};
