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

const { ApolloServer } = require('apollo-server-express');
const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const morgan = require('morgan');

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

let apolloServer = null;
async function startServer() {
  apolloServer = new ApolloServer({
    schema
  });
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });
}
startServer();

const httpServer = http.createServer(app);

const { useServer } = require('graphql-ws/use/ws');
const ws = require('ws');

httpServer.listen({ port }, () => {
  log(`Listening on ${port} (HTTP & Websocket), GraphQL endpoint: http://localhost:${port}${apolloServer.graphqlPath}`);

  const wsServer = new ws.Server({
    server: httpServer,
    path: '/graphql'
  });

  useServer({ schema }, wsServer);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
