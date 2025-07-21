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

require('@instana/core/test/test_util/loadExpressV4');

require('../../../..')();

const { ApolloServer } = require('@apollo/server');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/use/ws');

// In Apollo Server v5, use @as-integrations/express5; otherwise, fall back to the built-in v4 middleware.
const apolloServerVersion = process.env.APOLLO_SERVER_VERSION || 'latest';

let expressMiddleware;

if (apolloServerVersion === 'latest') {
  ({ expressMiddleware } = require('@as-integrations/express5'));
} else {
  ({ expressMiddleware } = require('@apollo/server-v4/express4'));
}

const { schema, pubsub, pinoLogger } = require('./schema')();
const data = require('./data');

const port = require('../../../test_util/app-port')();
const app = express();

const logPrefix = `GraphQL/Apollo Server (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/publish-update', (req, res) => {
  let { id, name, profession } = req.body;
  if (id == null) {
    id = 4;
  }
  if (typeof id === 'string') {
    id = parseInt(id, 10);
  }
  if (isNaN(id) || id <= 0) {
    id = 4;
  }
  const character = data.characters[id - 1];
  character.name = name;
  character.profession = profession;
  pinoLogger.warn(`update: ${character.id}: ${character.name} ${character.profession}`);
  pubsub.publish('characterUpdated', {
    characterUpdated: character
  });
  res.send(character);
});

const apolloServer = new ApolloServer({
  schema
});

(async () => {
  await apolloServer.start();

  app.use('/graphql', expressMiddleware(apolloServer));

  const httpServer = app.listen({ port }, () => {
    log(
      `Listening on ${port} (HTTP & Websocket), GraphQL endpoint: http://localhost:${port}${apolloServer.graphqlPath}`
    );

    const wsServer = new WebSocketServer({
      server: httpServer,
      path: '/graphql'
    });

    useServer({ schema }, wsServer);
  });
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
