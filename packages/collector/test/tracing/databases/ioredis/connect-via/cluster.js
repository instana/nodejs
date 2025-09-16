/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: We run the tests locally and on CI against azure redis cluster.
// NOTE: We cannot run redis cluster on Tekton https://github.com/bitnami/charts/issues/28894
// NOTE: We cannot use a docker based redis cluster at the moment!
//       See https://github.com/redis/node-redis/issues/2815
// NOTE: The Docker-based Redis cluster(image:bitnami/redis-cluster) was removed from Docker Compose,
//       as it was no longer used locally and will require a paid subscription after Aug 28, 2025:
//       https://bitnami.com/announcements/bitnami-docker-image-changes
// NOTE: If a local Docker setup is needed in the future, we can explore
//       alternative images or solutions.

module.exports = async function connect(ioredis, log) {
  if (!process.env.AZURE_REDIS_CLUSTER || !process.env.AZURE_REDIS_CLUSTER_PWD) {
    log(
      'Please set the environment variables AZURE_REDIS_CLUSTER and AZURE_REDIS_CLUSTER_PWD ' +
        'to connect to the cloud redis cluster.'
    );

    process.exit(1);
  }

  const hostAndPort = process.env.AZURE_REDIS_CLUSTER.split(':');

  // See https://github.com/redis/ioredis/issues/1786
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const cluster = new ioredis.Cluster(
    [
      {
        host: hostAndPort[0],
        port: hostAndPort[1]
      }
    ],
    {
      redisOptions: {
        tls: true,
        password: process.env.AZURE_REDIS_CLUSTER_PWD,
        connectTimeout: 10000
      },
      retryDelayOnFailover: 1000,
      maxRetriesPerRequest: 10
    }
  );

  log(`Connecting to cluster host: ${hostAndPort[0]}, port: ${hostAndPort[1]}.`);

  return new Promise(resolve => {
    cluster.on('ready', () => {
      log('Connected to cluster.');
      resolve({ connection: cluster });
    });
  });
};
