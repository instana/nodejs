/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = function (redis, log) {
  console.log('  process.env.REDIS_CLUSTER', process.env.REDIS_CLUSTER, process.env.REDIS_CLUSTER === 'true');
  if (process.env.REDIS_CLUSTER === 'true') {
    return require('./cluster')(redis, log);
  }

  return require('./default')(redis, log);
};
