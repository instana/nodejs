/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

require('../../../../../..')();

const { ApolloServer, gql } = require('apollo-server-express');
const { buildFederatedSchema } = require('@apollo/federation');
const bodyParser = require('body-parser');
const express = require('express');
const http = require('http');
const morgan = require('morgan');

const port = process.env.APP_PORT;
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
