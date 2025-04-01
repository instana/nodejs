/*
 * (c) Copyright IBM Corp. 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

require('../../../..')();

const { ApolloServer } = require('apollo-server-express');
const { ApolloGateway, IntrospectAndCompose } = require('@apollo/gateway');
const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const morgan = require('morgan');

const accountsPort = process.env.SERVICE_PORT_ACCOUNTS;
const inventoryPort = process.env.SERVICE_PORT_INVENTORY;
const productsPort = process.env.SERVICE_PORT_PRODUCTS;
const reviewsPort = process.env.SERVICE_PORT_REVIEWS;

const port = require('../../../test_util/app-port')();
const app = express();

const logPrefix = `Apollo Subgraph Gateway (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      { name: 'accounts', url: `http://localhost:${accountsPort}/graphql` },
      { name: 'inventory', url: `http://localhost:${inventoryPort}/graphql` },
      { name: 'products', url: `http://localhost:${productsPort}/graphql` },
      { name: 'reviews', url: `http://localhost:${reviewsPort}/graphql` }
    ]
  })
});
app.get('/', (req, res) => {
  res.sendStatus(200);
});

(async () => {
  const { schema, executor } = await gateway.load();
  const server = new ApolloServer({ schema, executor });
  await server.start();
  server.applyMiddleware({ app });
  const httpServer = http.createServer(app);
  httpServer.listen({ port }, () => {
    log(`Listening at ${port}`);
  });
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
