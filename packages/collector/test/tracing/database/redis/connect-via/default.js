/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = async function (redis, log) {
  const client = redis.createClient({ url: `redis://${process.env.REDIS}` });
  const client2 = redis.createClient({ url: `redis://${process.env.REDIS_ALTERNATIVE}` });
  let pool;
  [client, client2].forEach(c => {
    c.on('error', err => log('Redis Client Error', err));
  });

  log('Connecting to client 1');
  await client.connect();
  log(`Connected to client 1 (${process.env.REDIS}).`);

  log('Connecting to client 2');
  await client2.connect();
  log(`Connected to client 2 (${process.env.REDIS_ALTERNATIVE}).`);

  if (process.env.REDIS_VERSION === 'latest') {
    pool = await redis.createClientPool({
      url: `redis://${process.env.REDIS}`,

      minimum: 1,
      maximum: 100,
      acquireTimeout: 3000,
      cleanupDelay: 3000
    });
    pool.on('error', err => console.error('Redis Client Pool Error', err));
    await pool.connect(); // Connect the pool
    log(`Connected to pool(${process.env.REDIS}).`);
  }
  return {
    connection1: client,
    connection2: client2,
    pool1: pool
  };
};
