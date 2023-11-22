/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

require('./mockVersion');
const redisLatest = process.env.REDIS_VERSION === 'latest';

if (redisLatest) {
  require('./latestApp');
} else {
  // v3
  require('./legacyApp');
}
