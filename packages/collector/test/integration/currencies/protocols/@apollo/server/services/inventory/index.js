/*
 * (c) Copyright IBM Corp. 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const { ApolloServer } = require('@apollo/server');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const morgan = require('morgan');
const { gql } = require('graphql-tag');

let expressMiddleware;
if (parseInt(process.env.LIBRARY_VERSION, 10) >= 5) {
  ({ expressMiddleware } = require('@as-integrations/express5'));
} else {
  ({ expressMiddleware } = require('@apollo/server/express4'));
}

const port = require('@_local/collector/test/test_util/app-port')();
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

const inventory = [
  { upc: '1', inStock: true },
  { upc: '2', inStock: false },
  { upc: '3', inStock: true }
];

const resolvers = {
  Product: {
    __resolveReference(object) {
      return {
        ...object,
        ...inventory.find(product => product.upc === object.upc)
      };
    },
    shippingEstimate(object) {
      if (object.price > 1000) return 0;
      return object.weight * 0.5;
    }
  }
};

const server = new ApolloServer({
  schema: buildSubgraphSchema([
    {
      typeDefs,
      resolvers
    }
  ])
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

(async () => {
  await server.start();

  app.use('/graphql', expressMiddleware(server));

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
