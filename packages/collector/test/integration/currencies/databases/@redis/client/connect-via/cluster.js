/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const MAX_TRIES = 50;
const { delay } = require('@_local/core/test/test_util');

// NOTE: We run the tests locally and on CI against azure redis cluster.
// NOTE: We cannot run redis cluster on Tekton https://github.com/bitnami/charts/issues/28894
// NOTE: We cannot use a docker based redis cluster at the moment!
//       See https://github.com/redis/node-redis/issues/2815
// NOTE: The Docker-based Redis cluster(image:bitnami/redis-cluster) was removed from Docker Compose,
//       as it was no longer used locally and will require a paid subscription after Aug 28, 2025:
//       https://bitnami.com/announcements/bitnami-docker-image-changes
// NOTE: If a local Docker setup is needed in the future, we can explore
//       alternative images or solutions.

module.exports = async function connect(redis, log, tries = 0) {
  if (!process.env.AZURE_REDIS_CLUSTER || !process.env.AZURE_REDIS_CLUSTER_PWD) {
    log(
      'Please set the environment variables AZURE_REDIS_CLUSTER and AZURE_REDIS_CLUSTER_PWD ' +
      'to connect to the cloud redis cluster.'
    );

    process.exit(1);
  }

  const nodes = [
    {
      url: `rediss://${process.env.AZURE_REDIS_CLUSTER}`
    }
  ];

  const defaults = {
    socket: {
      tls: true
    },
    password: process.env.AZURE_REDIS_CLUSTER_PWD
  };

  // See https://github.com/redis/ioredis/issues/1786
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // node bin/start-test-containers.js --redis-node-0 --redis-node-1 --redis-node-2
  // docker exec -it 2aaaac7b9112 redis-cli -p 6379 cluster info
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
