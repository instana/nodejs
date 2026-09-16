/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const MAX_TRIES = 50;
const { delay } = require('@_local/core/test/test_util');

module.exports = async function connect(redis, log, tries = 0) {
  const clusterAddress = process.env.INSTANA_CONNECT_REDIS_CLUSTER || '127.0.0.1:7000';
  const protocol = 'redis';

  const nodes = [
    {
      url: `${protocol}://${clusterAddress}`
    }
  ];

  const defaults = {};

  const cluster = redis.createCluster({
    rootNodes: nodes,
    useReplicas: false,
    defaults
    // https://github.com/redis/node-redis/issues/2022
    // maxCommandRedirections: 100
  });

  cluster.on('error', err => log('Redis Cluster Error', err));

  log(`Connecting to cluster. (${nodes.map(node => node.url).join(', ')})`);

  try {
    await cluster.connect();
    log('Connected to cluster');
    return { connection1: cluster };
  } catch (err) {
    log('Failed to connect to cluster', err);

    if (tries >= MAX_TRIES) {
      log('Max tries reached, exiting.');
      process.exit(1);
    }

    log('Retrying...');
    log('Waiting...');
    await delay(5000);
    log('Waited...');

    tries += 1;
    return module.exports.connect(redis, log, tries);
  }
};
