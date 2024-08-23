/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { isCI, delay } = require('../../../../../../core/test/test_util');
const MAX_TRIES = 50;

// node bin/start-test-containers.js --redis-node-0 --redis-node-1 --redis-node-2
// docker exec -it 2aaaac7b9112 redis-cli -p 6379 cluster info
module.exports = async function connect(redis, log, tries = 0) {
  let nodes = [
    {
      url: `redis://${process.env.REDIS_NODE_1}`
    },
    {
      url: `redis://${process.env.REDIS_NODE_2}`
    },
    {
      url: `redis://${process.env.REDIS_NODE_3}`
    }
  ];

  let defaults = {
    url: `redis://${process.env.REDIS_NODE_1}`
  };

  // NOTE: we cannot run redis cluster on Tekton https://github.com/bitnami/charts/issues/28894
  if (isCI()) {
    nodes = [
      {
        url: `redis://${process.env.AZURE_REDIS_CLUSTER}`
      }
    ];

    defaults = {
      socket: {
        tls: true
      },
      password: process.env.AZURE_REDIS_CLUSTER_PWD
    };
  }

  // node bin/start-test-containers.js --redis-node-0 --redis-node-1 --redis-node-2
  // docker exec -it 2aaaac7b9112 redis-cli -p 6379 cluster info
  const cluster = redis.createCluster({
    rootNodes: nodes,
    useReplicas: false,
    defaults
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
