/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = async function connect(ioredis, log) {
  const clusterAddress = process.env.INSTANA_CONNECT_REDIS_CLUSTER || '127.0.0.1:7000';
  const hostAndPort = clusterAddress.split(':');

  const redisOptions = {
    connectTimeout: 10000
  };

  if (process.env.AZURE_REDIS_CLUSTER_PWD) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    redisOptions.tls = true;
    redisOptions.password = process.env.AZURE_REDIS_CLUSTER_PWD;
  }

  const cluster = new ioredis.Cluster(
    [
      {
        host: hostAndPort[0],
        port: parseInt(hostAndPort[1], 10) || 7000
      }
    ],
    {
      redisOptions,
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
