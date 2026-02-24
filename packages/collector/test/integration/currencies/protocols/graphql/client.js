/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const amqp = require('amqplib');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const { v4: uuid } = require('uuid');

const serverPort = process.env.SERVER_PORT;
const serverGraphQLEndpoint = `http://127.0.0.1:${serverPort}/graphql`;

const app = express();
const port = require('@_local/collector/test/test_util/app-port')();
const logPrefix = `GraphQL Client (${process.pid}):\t`;

let channel;
const requestQueueName = 'graphql-request-queue';
let responseQueueName;
let amqpConnected = false;

const amqpResponseHandlers = {};

// We establish an AMQP connection to test GraphQL queries over non-HTTP protocols.
amqp
  .connect(process.env.INSTANA_CONNECT_RABBITMQ_AMQP)
  .then(connection => connection.createChannel())
  .then(_channel => {
    channel = _channel;
    return channel.assertQueue(requestQueueName, { durable: false });
  })
  .then(() => channel.purgeQueue(requestQueueName))
  .then(() => channel.assertQueue('', { durable: false, exclusive: true }))
  .then(responseQueue => {
    responseQueueName = responseQueue.queue;
    amqpConnected = true;
    log('amqp connection established');
  })
  // eslint-disable-next-line no-console
  .catch(console.warn);

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (amqpConnected) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post('/value', (req, res) => runQuery(req, res, 'value'));

app.post('/promise', (req, res) => runQuery(req, res, 'promise'));

app.post('/array', (req, res) => runQuery(req, res, 'array'));

app.post('/mutation', (req, res) =>
  runMutation(req, res, {
    id: 4,
    name: 'The Investigator',
    profession: 'Zombie Protomolecule Hallucination'
  })
);

function runQuery(req, res, resolverType) {
  resolverType = req.query.withError ? `${resolverType}Error` : resolverType;
  const multipleEntities = !!req.query.multipleEntities;
  const operationPrefix = req.query.queryShorthand ? '' : 'query OperationName';
  const alias = req.query.useAlias ? `${resolverType}Alias: ` : '';
  const communicationProtocol = req.query.communicationProtocol || 'http';
  const query = `
    ${operationPrefix} {
      ${alias}${resolverType}(crewMember: true) {
        id
        name
        profession
      }
      ${multipleEntities ? 'ships { id name origin }' : ''}
    }
  `;

  if (communicationProtocol === 'http') {
    return runQueryViaHttp(query, res);
  } else if (communicationProtocol === 'amqp') {
    return runQueryViaAmqp(query, res);
  } else {
    log('Unknown protocol:', communicationProtocol);
    res.status(400).send({
      message: `Unknown protocol: ${communicationProtocol}`
    });
  }
}

function runQueryViaHttp(query, res) {
  return fetch(serverGraphQLEndpoint, {
    method: 'POST',
    url: serverGraphQLEndpoint,
    body: JSON.stringify({
      query
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(response => response.json())
    .then(response => {
      res.send(response);
    })
    .catch(e => {
      log(e);
      res.sendStatus(500);
    });
}

function runQueryViaAmqp(query, res) {
  const correlationId = uuid();

  amqpResponseHandlers[correlationId] = msg => {
    const response = JSON.parse(msg.content.toString());
    res.json(response);
  };

  channel.consume(
    responseQueueName,
    msg => {
      if (!msg.properties.correlationId) {
        log('Warning: Got message without correlation ID, ignoring.');
        return;
      }
      const responseHandler = amqpResponseHandlers[msg.properties.correlationId];
      if (!responseHandler) {
        log(`Warning: No response handler for correlation ID ${msg.properties.correlationId}, ignoring.`);
        return;
      }

      responseHandler(msg);
    },
    {
      noAck: true
    }
  );

  const requestBody = JSON.stringify({ query });

  channel.sendToQueue(requestQueueName, Buffer.from(requestBody), {
    correlationId,
    replyTo: responseQueueName
  });
}

function runMutation(req, res, input) {
  const mutation = `
    mutation UpdateCharacter($id: ID!, $name: String, $profession: String) {
      updateCharacter(input: { id: $id, name: $name, profession: $profession }) {
        name
        profession
      }
    }
  `;

  return fetch(serverGraphQLEndpoint, {
    method: 'POST',
    url: serverGraphQLEndpoint,
    body: JSON.stringify({
      query: mutation,
      variables: input
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(response => response.json())
    .then(response => {
      res.send(response);
    })
    .catch(e => {
      log(e);
      res.sendStatus(500);
    });
}

app.listen(port, () => {
  log(`Listening on port ${port} (downstream server port: ${serverPort}).`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
