'use strict';

require('../../../../')();

const SubscriptionClient = require('subscriptions-transport-ws').SubscriptionClient;
const WebSocketLink = require('apollo-link-ws').WebSocketLink;
const amqp = require('amqplib');
const bodyParser = require('body-parser');
const execute = require('apollo-link').execute;
const express = require('express');
const morgan = require('morgan');
const rp = require('request-promise');
const uuid = require('uuid/v4');
const ws = require('ws');

const serverPort = process.env.SERVER_PORT || 3217;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
const serverGraphQLEndpoint = `${serverBaseUrl}/graphql`;
const serverWsGraphQLUrl = `ws://127.0.0.1:${serverPort}/graphql`;

const app = express();
const port = process.env.APP_PORT || 3216;
const logPrefix = `GraphQL Client (${process.pid}):\t`;

let channel;
const requestQueueName = 'graphql-request-queue';
let responseQueueName;
let amqpConnected = false;

// We establish an AMQP connection to test GraphQL queries over non-HTTP protocols.
amqp
  .connect('amqp://localhost')
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
  rp({
    method: 'POST',
    url: `${serverBaseUrl}/publish-update`,
    body: JSON.stringify({
      id: req.body.id || 1,
      name: 'Updated Name',
      profession: 'Updated Profession'
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
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
  return rp({
    method: 'POST',
    url: serverGraphQLEndpoint,
    body: JSON.stringify({
      query
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
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
  channel.consume(
    responseQueueName,
    msg => {
      if (msg.properties.correlationId === correlationId) {
        const response = msg.content.toString();
        res.send(response);
      }
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
  return rp({
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
    .then(response => {
      res.send(response);
    })
    .catch(e => {
      log(e);
      res.sendStatus(500);
    });
}

function establishSubscription(req, res) {
  const subscribeQuery = `
    subscription onCharacterUpdated($id: ID!) {
      characterUpdated(id: $id) {
        id
        name
        profession
      }
    }
  `;

  const subscriptionClient = createSubscriptionObservable(serverWsGraphQLUrl, subscribeQuery, {
    id: req.query.id || 1
  });
  subscriptionClient.subscribe(
    eventData => {
      if (process.send) {
        process.send(`character updated: ${JSON.stringify(eventData)}`);
      }
    },
    err => {
      if (process.send) {
        process.send(`character updated error: ${JSON.stringify(err)}`);
      }
    }
  );
  res.sendStatus(204);
}

app.listen(port, () => {
  log(`Listening on port ${port} (downstream server port: ${serverPort}).`);
});

function createSubscriptionObservable(webSocketUrl, query, variables) {
  const webSocketClient = new SubscriptionClient(webSocketUrl, { reconnect: true }, ws);
  const webSocketLink = new WebSocketLink(webSocketClient);
  return execute(webSocketLink, {
    query,
    variables
  });
}

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
