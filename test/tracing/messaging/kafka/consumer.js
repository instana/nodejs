/* eslint-disable */

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var kafka = require('kafka-node');
var uuid = require('uuid/v4');

var client = new kafka.Client(process.env.ZOOKEEPER + '/');
client.on('error', function(error) {
  log('Got a client error: %s', error);
});

var consumer;
if (process.env.CONSUMER_TYPE === 'plain') {
  log('Using Consumer');
  consumer = new kafka.Consumer(
    client,
    [
      {
        topic: 'test'
      }
    ],
    {
      fromOffset: false,
      groupId: uuid()
    }
  );
} else if (process.env.CONSUMER_TYPE === 'highLevel') {
  log('Using HighLevelConsumer');
  consumer = new kafka.HighLevelConsumer(
    client,
    [
      {
        topic: 'test'
      }
    ],
    {
      fromOffset: false,
      groupId: uuid()
    }
  );
} else {
  log('Using ConsumerGroup');
  consumer = new kafka.ConsumerGroup(
    {
      host: process.env.ZOOKEEPER,
      fromOffset: 'latest',
      groupId: uuid()
    },
    ['test']
  );
}

consumer.on('error', function(err) {
  log('Error occured in consumer:', err);
});

consumer.on('message', function() {
  log('Got message in Kafka consumer', arguments);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Express Kafka Producer App (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
