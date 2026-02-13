/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const sentinelHost = process.env.INSTANA_CONNECT_REDIS_SENTINEL_HOST;
const sentinelPort = process.env.INSTANA_CONNECT_REDIS_SENTINEL_PORT;
const masterName = process.env.INSTANA_CONNECT_REDIS_SENTINEL_MASTER_NAME;

module.exports = async function initializeSentinelConnection(redis, log) {
  const sentinelNodes = [{ host: sentinelHost, port: sentinelPort }];

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
