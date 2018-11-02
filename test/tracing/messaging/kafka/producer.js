/* eslint-disable */

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var express = require('express');
var kafka = require('kafka-node');
var app = express();

var client = new kafka.Client(process.env.ZOOKEEPER + '/');
client.on('error', function(error) {
  log('Got a client error: %s', error);
});

var producer = new kafka.Producer(client);
producer.on('error', function(error) {
  log('Got a producer error: %s', error);
});

producer.on('ready', function() {
  log('Producer is now ready');
});

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.send('OK');
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

app.post('/send-message', function(req, res) {
  var key = req.body.key;
  var message = req.body.message;

  log('Sending message with key %s and body %s', key, message);
  producer.send(
    [
      {
        topic: 'test',
        messages: new kafka.KeyedMessage(key, message)
      }
    ],
    function(err) {
      if (err) {
        log('Failed to send message with key %s', key, err);
        res.status(500).send('Failed to send message');
        return;
      }
      res.sendStatus(200);
    }
  );
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Express Kafka Producer App (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
