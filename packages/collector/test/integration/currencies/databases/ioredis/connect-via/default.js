/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = async function (ioredis, log) {
  const redisHost = process.env.INSTANA_CONNECT_REDIS;
  const redisHost2 = process.env.INSTANA_CONNECT_REDIS_ALTERNATIVE;
  const client = new ioredis(`redis://${redisHost}`);
  const client2 = new ioredis(`redis://${redisHost2}`);

  return new Promise(resolve => {
    let clientReady = false;
    let client2Ready = false;

    client.on('ready', () => {
      clientReady = true;
      log(`Connected to client 1 (${redisHost}).`);

      if (client2Ready) {
        resolve({
          connection: client,
          connection2: client2
        });
      }
    });

    client2.on('ready', () => {
      client2Ready = true;
      log(`Connected to client 2 (${redisHost2}).`);

      if (clientReady) {
        resolve({
          connection: client,
          connection2: client2
        });
      }
    });
  });
};
