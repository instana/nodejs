/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const graphQL = require('graphql');
const graphqlSubscriptions = require('graphql-subscriptions');
const data = require('./data');
const pinoLogger = require('pino')();

module.exports = function exportSchema() {
  const pubsub = new graphqlSubscriptions.PubSub();

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
        characters: {
          type: new graphQL.GraphQLList(CharacterType),
          resolve() {
            return data.characters;
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

            if (pubsub?.asyncIterableIterator) {
              return pubsub.asyncIterableIterator('characterUpdated');
            } else {
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
