/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

module.exports = async function (redis, log) {
  const pool = await redis.createClientPool({
    url: `redis://${process.env.REDIS}`
  });
  // eslint-disable-next-line no-console
  pool.on('error', err => console.error('Redis Client Pool Error', err));
  await pool.connect();
  log(`Connected to pool(${process.env.REDIS}).`);
  return { connection1: pool };
};
