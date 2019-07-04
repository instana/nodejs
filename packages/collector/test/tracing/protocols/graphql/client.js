'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: process.env.INSTANA_LOG_LEVEL || 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false'
  }
});

const bodyParser = require('body-parser');
const rp = require('request-promise');
const execute = require('apollo-link').execute;
const express = require('express');
const morgan = require('morgan');
const SubscriptionClient = require('subscriptions-transport-ws').SubscriptionClient;
const WebSocketLink = require('apollo-link-ws').WebSocketLink;
const ws = require('ws');

const serverPort = process.env.SERVER_PORT || 3217;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
const serverGraphQLEndpoint = `${serverBaseUrl}/graphql`;
const serverWsGraphQLUrl = `ws://127.0.0.1:${serverPort}/graphql`;

const app = express();
const port = process.env.APP_PORT || 3216;
const logPrefix = `GraphQL Client (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.post('/value', (req, res) => runQuery(req, res, 'value'));

app.post('/promise', (req, res) => runQuery(req, res, 'promise'));

app.post('/array', (req, res) => runQuery(req, res, 'array'));

app.post('/mutation', (req, res) => {
  return runMutation(req, res, {
    id: 4,
    name: 'The Investigator',
    profession: 'Zombie Protomolecule Hallucination'
  });
});

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
    query: query,
    variables: variables
  });
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
