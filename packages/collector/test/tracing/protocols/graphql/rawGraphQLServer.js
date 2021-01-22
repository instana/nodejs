/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

require('../../../../')();

const bodyParser = require('body-parser');
const express = require('express');
const graphQL = require('graphql');
const morgan = require('morgan');
const amqp = require('amqplib');

// Pino log spans are used to verify that follow up calls are traced correctly in a GraphQL entry.
const pinoLogger = require('pino')();

const data = require('./data');

const graphql = graphQL.graphql;

const port = process.env.APP_PORT || 3217;
const app = express();

const logPrefix = `GraphQL (raw) Server (${process.pid}):\t`;

let channel;
const requestQueueName = 'graphql-request-queue';
let amqpConnected = false;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

const CharacterType = new graphQL.GraphQLObjectType({
  name: 'Character',
  fields: {
    id: {
      type: graphQL.GraphQLID
    },
    name: {
      type: graphQL.GraphQLString
    },
    profession: {
      type: graphQL.GraphQLString
    },
    crewMember: {
      type: graphQL.GraphQLBoolean
    }
  }
});

const ShipType = new graphQL.GraphQLObjectType({
  name: 'Ship',
  fields: {
    id: {
      type: graphQL.GraphQLID
    },
    name: {
      type: graphQL.GraphQLString
    },
    origin: {
      type: graphQL.GraphQLString
    }
  }
});

const CharacterUpdateInputType = new graphQL.GraphQLInputObjectType({
  name: 'CharacterUpdateInput',
  fields: {
    id: {
      type: graphQL.GraphQLID
    },
    name: {
      type: graphQL.GraphQLString
    },
    profession: {
      type: graphQL.GraphQLString
    }
  }
});

const schema = new graphQL.GraphQLSchema({
  query: new graphQL.GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      value: {
        type: new graphQL.GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: graphQL.GraphQLBoolean
          }
        },
        resolve(__, { crewMember }) {
          pinoLogger.warn('value');
          return data.filterCharacters(crewMember);
        }
      },
      valueError: {
        type: new graphQL.GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: graphQL.GraphQLBoolean
          }
        },
        resolve() {
          pinoLogger.warn('valueError');
          throw new Error('Boom');
        }
      },
      promise: {
        type: new graphQL.GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: graphQL.GraphQLBoolean
          }
        },
        resolve(__, { crewMember }) {
          return logAndResolve('promise', data.filterCharacters(crewMember));
        }
      },
      promiseError: {
        type: new graphQL.GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: graphQL.GraphQLBoolean
          }
        },
        resolve() {
          return logAndReject('promiseError', new Error('Boom'));
        }
      },
      array: {
        type: new graphQL.GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: graphQL.GraphQLBoolean
          }
        },
        resolve() {
          return [logAndResolve('array', data.jim), Promise.resolve(data.naomi), Promise.resolve(data.amos)];
        }
      },
      arrayError: {
        type: new graphQL.GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: graphQL.GraphQLBoolean
          }
        },
        resolve() {
          return [
            logAndReject('arrayError', new Error('Boom')),
            Promise.reject(new Error('Boom')),
            Promise.reject(new Error('Boom'))
          ];
        }
      },
      ships: {
        type: new graphQL.GraphQLList(ShipType),
        resolve() {
          return data.ships;
        }
      }
    }
  }),

  mutation: new graphQL.GraphQLObjectType({
    name: 'RootMutationType',
    fields: {
      updateCharacter: {
        type: CharacterType,
        args: {
          input: {
            type: CharacterUpdateInputType
          }
        },
        resolve(obj, { input }) {
          const { id, name, profession } = input;
          pinoLogger.warn(`update: ${id}: ${name} ${profession}`);
          return { name, profession };
        }
      }
    }
  }),

  subscription: new graphQL.GraphQLObjectType({
    name: 'RootSubscriptionType',
    fields: {
      characterUpdated: {
        type: CharacterType,
        args: {
          id: {
            type: graphQL.GraphQLID
          }
        },
        subscribe() {
          throw new Error('NOT IMPLEMENTED YET');
        }
      }
    }
  })
});

amqp
  .connect('amqp://localhost')
  .then(connection => connection.createChannel())
  .then(_channel => {
    channel = _channel;
    return channel.assertQueue(requestQueueName, { durable: false });
  })
  .then(() => channel.purgeQueue(requestQueueName))
  .then(() => {
    channel.prefetch(1);
    channel.consume(requestQueueName, msg => {
      channel.ackAll();
      const requestContent = JSON.parse(msg.content.toString());
      if (!requestContent || typeof requestContent.query !== 'string') {
        channel.sendToQueue(msg.properties.replyTo, Buffer.from('You need to provide a query.'), {
          correlationId: msg.properties.correlationId
        });
        return;
      }

      graphql(schema, requestContent.query, null, null, requestContent.variables).then(result => {
        const stringifiedResult = JSON.stringify(result);
        channel.sendToQueue(msg.properties.replyTo, Buffer.from(stringifiedResult), {
          correlationId: msg.properties.correlationId
        });
      });
    });
    amqpConnected = true;
    log('amqp connection established');
  });

app.get('/', (req, res) => {
  if (amqpConnected) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.use('/graphql', bodyParser.json());

app.post('/graphql', (req, res) => {
  if (!req.body || typeof req.body.query !== 'string') {
    return res.status(400).send('You need to provide a query.');
  }
  graphql(schema, req.body.query, null, null, req.body.variables).then(result => {
    res.send(result);
  });
});

app.listen(port, () => {
  log(`Listening on port ${port}.`);
});

function logAndResolve(logMsg, value) {
  pinoLogger.warn(logMsg);
  return Promise.resolve(value);
}
function logAndReject(logMsg, error) {
  pinoLogger.warn(logMsg);
  return Promise.reject(error);
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
