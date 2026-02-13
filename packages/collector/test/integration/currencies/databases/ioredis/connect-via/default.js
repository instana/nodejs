/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = async function (ioredis, log) {
  const client = new ioredis(`//${process.env.INSTANA_CONNECT_REDIS}`);
  const client2 = new ioredis(`//${process.env.INSTANA_CONNECT_REDIS_ALTERNATIVE}`);

  return new Promise(resolve => {
    let clientReady = false;
    let client2Ready = false;

    client.on('ready', () => {
      clientReady = true;
      log(`Connected to client 1 (${process.env.INSTANA_CONNECT_REDIS}).`);

      if (client2Ready) {
        resolve({
          connection: client,
          connection2: client2
        });
      }
    });

    client2.on('ready', () => {
      client2Ready = true;
      log(`Connected to client 2 (${process.env.INSTANA_CONNECT_REDIS_ALTERNATIVE}).`);

      if (clientReady) {
        resolve({
          connection: client,
          connection2: client2
        });
      }
    });
  });
};
