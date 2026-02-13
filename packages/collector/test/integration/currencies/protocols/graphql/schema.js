/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const graphQL = require('graphql');
const graphqlSubscriptions = require('graphql-subscriptions');
const data = require('./data');
// Pino log spans are used to verify that follow up calls are traced correctly in a GraphQL entry.
const pinoLogger = require('pino')();

module.exports = function exportSchema() {
  const pubsub = new graphqlSubscriptions.PubSub();

  function logAndResolve(logMsg, value) {
    pinoLogger.warn(logMsg);
    return Promise.resolve(value);
  }

  function logAndReject(logMsg, error) {
    pinoLogger.warn(logMsg);
    return Promise.reject(error);
  }

  const CharacterType = new graphQL.GraphQLObjectType({
    name: 'Character',
    fields: {
      id: {
        type: graphQL.GraphQLString
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
        }
      }
    }),

    subscription: new graphQL.GraphQLObjectType({
      name: 'Subscription',
      fields: {
        characterUpdated: {
          type: CharacterType,
          args: {
            id: {
              type: graphQL.GraphQLString
            }
          },
          subscribe: (__, { id }) => {
            pinoLogger.warn(`subscribe: ${id}`);

            // for graphql-subscriptions, asyncIterator is replaced with asyncIterableIterator in v3
            if (pubsub?.asyncIterableIterator) {
              return pubsub.asyncIterableIterator('characterUpdated');
            } else {
              // v2 or lesser
              return pubsub.asyncIterator('characterUpdated');
            }
          }
        }
      }
    })
  });

  return {
    schema,
    pinoLogger,
    pubsub
  };
};
