/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

require('../../../..')();

const { ApolloServer } = require('apollo-server-express');
const { ApolloGateway } = require('@apollo/gateway');
const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const morgan = require('morgan');

const accountsPort = process.env.SERVICE_PORT_ACCOUNTS || 4200;
const inventoryPort = process.env.SERVICE_PORT_INVENTORY || 4201;
const productsPort = process.env.SERVICE_PORT_PRODUCTS || 4202;
const reviewsPort = process.env.SERVICE_PORT_REVIEWS || 4203;

const port = process.env.APP_PORT || 3217;
const app = express();

const logPrefix = `Apollo Federation Gateway (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const gateway = new ApolloGateway({
  serviceList: [
    { name: 'accounts', url: `http://localhost:${accountsPort}/graphql` },
    { name: 'inventory', url: `http://localhost:${inventoryPort}/graphql` },
    { name: 'products', url: `http://localhost:${productsPort}/graphql` },
    { name: 'reviews', url: `http://localhost:${reviewsPort}/graphql` }
  ]
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

(async () => {
  const { schema, executor } = await gateway.load();

  const server = new ApolloServer({ schema, executor });
  server.applyMiddleware({ app });
  const httpServer = http.createServer(app);

  httpServer.listen({ port }, () => {
    log(`Listening at ${port}.`);
  });
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
