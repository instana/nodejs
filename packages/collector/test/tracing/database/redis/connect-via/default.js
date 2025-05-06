/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = async function (redis, log) {
  const client = redis.createClient({ url: `redis://${process.env.REDIS}` });
  const client2 = redis.createClient({ url: `redis://${process.env.REDIS_ALTERNATIVE}` });
  [client, client2].forEach(c => {
    c.on('error', err => log('Redis Client Error', err));
  });

  log('Connecting to client 1');
  await client.connect();
  log(`Connected to client 1 (${process.env.REDIS}).`);

  log('Connecting to client 2');
  await client2.connect();
  log(`Connected to client 2 (${process.env.REDIS_ALTERNATIVE}).`);

  return {
    connection1: client,
    connection2: client2
  };
};
