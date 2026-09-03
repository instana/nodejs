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
  const clusterAddress = process.env.INSTANA_CONNECT_REDIS_CLUSTER || '127.0.0.1:7000';
  const hasPassword = Boolean(process.env.AZURE_REDIS_CLUSTER_PWD);
  const protocol = hasPassword ? 'rediss' : 'redis';

  const nodes = [
    {
      url: `${protocol}://${clusterAddress}`
    }
  ];

  const defaults = {};
  if (hasPassword) {
    defaults.socket = { tls: true };
    defaults.password = process.env.AZURE_REDIS_CLUSTER_PWD;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

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
