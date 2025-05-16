/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = function (redis, log) {
  const setupType = process.env.REDIS_SETUP_TYPE;
  const usePool = process.env.REDIS_POOL === 'true';

  if (setupType === 'cluster') {
    return require('./cluster')(redis, log);
  }

  if (setupType === 'sentinel') {
    return require('./sentinel')(redis, log);
  }

  if (usePool) {
    return require('./pool')(redis, log);
  }

  return require('./default')(redis, log);
};
