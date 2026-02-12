/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')({
  tracing: {
    allowRootExitSpan: true
  }
});

const { delay } = require('@_local/core/test/test_util');
const amqp = require('amqplib');
const exchange = require('./amqpUtil').exchange;

const logPrefix = `amqp Allow Root Exit Span App (${process.pid}):\t`;
let connection;

(async function run() {
  // wait til Instana is ready
  await delay(1000);

  amqp
    .connect(process.env.AMQP)
    .then(_connection => {
      connection = _connection;
      return connection.createChannel();
    })
    .then(channel => {
      log('amqp connection established');
      channel.publish(exchange, '', Buffer.from('welcome'));
      log('Sent message');
      channel.close();
      connection.close();
    })
    .catch(log);
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
