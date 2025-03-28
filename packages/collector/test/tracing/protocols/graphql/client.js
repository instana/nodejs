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

require('@instana/core/test/test_util/loadExpress4');

require('../../../..')();

const amqp = require('amqplib');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch-v2');
const { v4: uuid } = require('uuid');
const ws = require('ws');

/**
 * See
 *
 * https://github.com/apollographql/apollo-server/issues/6058
 * https://www.apollographql.com/docs/apollo-server/data/subscriptions/#the-graphql-ws-transport-library
 * https://github.com/apollographql/apollo-server/
 *    blob/apollo-server-express%402.24.1/packages/apollo-server-core/src/ApolloServer.ts#L39
 *    blob/apollo-server-express%402.24.1/packages/apollo-server-core/src/ApolloServer.ts#L898
 *
 * Subscriptions no longer working from GraphQL v15 using subscriptions-transport-ws
 * Furtermore subscriptions-transport-ws is no longer maintained
 */
const { createClient } = require('graphql-ws');

const serverPort = process.env.SERVER_PORT;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
const serverGraphQLEndpoint = `${serverBaseUrl}/graphql`;
const serverWsGraphQLUrl = `ws://127.0.0.1:${serverPort}/graphql`;

const app = express();
const port = require('../../../test_util/app-port')();
const logPrefix = `GraphQL Client (${process.pid}):\t`;

let channel;
const requestQueueName = 'graphql-request-queue';
let responseQueueName;
let amqpConnected = false;

const amqpResponseHandlers = {};

// We establish an AMQP connection to test GraphQL queries over non-HTTP protocols.
amqp
  .connect(process.env.AMQP)
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

app.post('/subscription', (req, res) => establishSubscription(req, res));

app.post('/publish-update-via-http', (req, res) =>
  fetch(`${serverBaseUrl}/publish-update`, {
    method: 'POST',
    url: `${serverBaseUrl}/publish-update`,
    body: JSON.stringify({
      id: req.body.id || 1,
      name: req.body.name || 'Updated Name',
      profession: req.body.profession || 'Updated Profession'
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
    })
);

app.post('/publish-update-via-graphql', (req, res) =>
  runMutation(req, res, {
    id: req.query.id || 1,
    name: 'Updated Name',
    profession: 'Updated Profession'
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

function establishSubscription(req, res) {
  const client = createClient({
    url: serverWsGraphQLUrl,
    webSocketImpl: ws
  });

  client.subscribe(
    {
      query: 'subscription onCharacterUpdated { characterUpdated (id: "1") { id name profession } }'
    },
    {
      next: data => {
        if (process.send) {
          process.send(`character updated: ${JSON.stringify(data)}`);
        }
      },
      error: err => {
        if (process.send) {
          process.send(`character updated error: ${err.message}`);
        }
      }
    }
  );

  res.sendStatus(204);
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
