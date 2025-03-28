/*
 * (c) Copyright IBM Corp. 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpress4');

require('../../../../../..')();

const { ApolloServer } = require('apollo-server-express');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const morgan = require('morgan');
const { gql } = require('graphql-tag');

const port = require('../../../../../test_util/app-port')();
const app = express();
const logPrefix = `Accounts Service (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const typeDefs = gql`
  extend type Query {
    me(withError: Boolean): User
  }

  type User @key(fields: "id") {
    id: ID!
    name: String
    username: String
  }
`;

const users = [
  {
    id: '1',
    name: 'Ada Lovelace',
    birthDate: '1815-12-10',
    username: '@ada'
  },
  {
    id: '2',
    name: 'Alan Turing',
    birthDate: '1912-06-23',
    username: '@complete'
  }
];

const resolvers = {
  Query: {
    me(__, { withError }) {
      if (withError) {
        throw new Error('Deliberately throwing an error in account service.');
      }
      return users[0];
    }
  },
  User: {
    __resolveReference(object) {
      return users.find(user => user.id === object.id);
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
