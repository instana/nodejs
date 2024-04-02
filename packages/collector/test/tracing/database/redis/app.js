/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');
const redisLatest = process.env.REDIS_VERSION === 'latest';

if (redisLatest) {
  require('./latestApp');
} else {
  // v3
  require('./legacyApp');
}
