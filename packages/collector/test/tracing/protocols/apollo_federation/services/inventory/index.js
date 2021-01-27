/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

require('../../../../../../')();

const { ApolloServer, gql } = require('apollo-server-express');
const { buildFederatedSchema } = require('@apollo/federation');
const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const morgan = require('morgan');

const port = process.env.APP_PORT || 4201;
const app = express();
const logPrefix = `Inventory Service (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const typeDefs = gql`
  extend type Product @key(fields: "upc") {
    upc: String! @external
    weight: Int @external
    price: Int @external
    inStock: Boolean
    shippingEstimate: Int @requires(fields: "price weight")
  }
`;

const inventory = [{ upc: '1', inStock: true }, { upc: '2', inStock: false }, { upc: '3', inStock: true }];

const resolvers = {
  Product: {
    __resolveReference(object) {
      return {
        ...object,
        ...inventory.find(product => product.upc === object.upc)
      };
    },
    shippingEstimate(object) {
      // free for expensive items
      if (object.price > 1000) return 0;
      // estimate is based on weight
      return object.weight * 0.5;
    }
  }
};

const server = new ApolloServer({
  schema: buildFederatedSchema([
    {
      typeDefs,
      resolvers
    }
  ])
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

server.applyMiddleware({ app });

const httpServer = http.createServer(app);

httpServer.listen({ port }, () => {
  log(`Listening on ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
