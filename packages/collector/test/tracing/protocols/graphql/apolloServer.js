/* global Promise */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: process.env.INSTANA_LOG_LEVEL || 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false'
  }
});

const { ApolloServer, gql } = require('apollo-server-express');
const bodyParser = require('body-parser');
const express = require('express');
const graphqlSubscriptions = require('graphql-subscriptions');
const http = require('http');
const morgan = require('morgan');

// Pino log spans are used to verify that follow up calls are traced correctly in a GraphQL entry.
const pinoLogger = require('pino')();

const data = require('./data');

const port = process.env.APP_PORT || 3217;
const app = express();
const pubsub = new graphqlSubscriptions.PubSub();

const logPrefix = `GraphQL/Apollo Server (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const typeDefs = gql`
  type Query {
    value(crewMember: Boolean): [Character]
    valueError(crewMember: Boolean): [Character]
    promise(crewMember: Boolean): [Character]
    promiseError(crewMember: Boolean): [Character]
    array(crewMember: Boolean): [Character]
    arrayError(crewMember: Boolean): [Character]
    ships(crewMember: Boolean): [Ship]
  }

  type Mutation {
    updateCharacter(input: CharacterUpdateInput): Character
  }

  type Subscription {
    characterUpdated(id: ID!): Character
  }

  type Character {
    id: ID
    name: String
    profession: String
    crewMember: Boolean
  }

  type Ship {
    id: ID
    name: String
    origin: String
  }

  input CharacterUpdateInput {
    id: ID!
    name: String
    profession: String
  }
`;

// The resolve function can return a value, a promise, or an array of promises.
const resolvers = {
  Query: {
    value: (__, { crewMember }) => {
      pinoLogger.warn('value');
      return data.filterCharacters(crewMember);
    },
    valueError: () => {
      pinoLogger.warn('valueError');
      throw new Error('Boom');
    },
    promise: (__, { crewMember }) => pinoLogAndResolve('promise', data.filterCharacters(crewMember)),
    promiseError: () => pinoLogAndReject('promiseError', new Error('Boom')),
    array: () => [pinoLogAndResolve('array', data.jim), Promise.resolve(data.naomi), Promise.resolve(data.amos)],
    arrayError: () => [
      pinoLogAndReject('arrayError', new Error('Boom')),
      Promise.reject(new Error('Boom')),
      Promise.reject(new Error('Boom'))
    ],
    ships: () => data.ships
  },
  Mutation: {
    updateCharacter: (root, { input }) => {
      let { id, name, profession } = input;
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
      return { name, profession };
    }
  },
  Subscription: {
    characterUpdated: {
      subscribe: (__, { id }) => {
        // The log exit should not be traced as subscribing creates no entry.
        pinoLogger.warn(`subscribe: ${id}`);
        return pubsub.asyncIterator('characterUpdated');
      }
    }
  }
};

const server = new ApolloServer({
  typeDefs,
  resolvers
});

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

server.applyMiddleware({ app });

const httpServer = http.createServer(app);
server.installSubscriptionHandlers(httpServer);

httpServer.listen({ port }, () => {
  log(`Listening on ${port} (HTTP & Websocket), GraphQL endpoint: http://localhost:${port}${server.graphqlPath}`);
});

function pinoLogAndResolve(logMsg, value) {
  pinoLogger.warn(logMsg);
  return Promise.resolve(value);
}
function pinoLogAndReject(logMsg, error) {
  pinoLogger.warn(logMsg);
  return Promise.reject(error);
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
