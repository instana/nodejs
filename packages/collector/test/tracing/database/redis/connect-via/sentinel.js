/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const sentinelHost = process.env.REDIS_SENTINEL_HOST;
const sentinelPort1 = process.env.REDIS_SENTINEL_PORT_1;
const sentinelPort2 = process.env.REDIS_SENTINEL_PORT_2;
const sentinelPort3 = process.env.REDIS_SENTINEL_PORT_3;
const masterName = process.env.REDIS_SENTINEL_MASTER_NAME;

module.exports = async function initializeSentinelConnection(redis, log) {
  const sentinelNodes = [
    { host: sentinelHost, port: sentinelPort1 },
    { host: sentinelHost, port: sentinelPort2 },
    { host: sentinelHost, port: sentinelPort3 }
  ];

  try {
    const client = await redis.createSentinel({
      name: masterName,
      sentinelRootNodes: sentinelNodes
    });

    client.on('error', err => {
      // eslint-disable-next-line no-console
      console.error('Redis Sentinel Error:', err);
    });

    await client.connect();
    log(`Connected to Redis Sentinel at ${sentinelHost}.`);

    return { connection1: client };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize Redis Sentinel connection:', error);
  }
};
