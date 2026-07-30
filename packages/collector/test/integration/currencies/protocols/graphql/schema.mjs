/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLSchema,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLID
} from 'graphql';
import pinoLoggerFactory from 'pino';

const data = require('./data.js');

const pinoLogger = pinoLoggerFactory();

function logAndResolve(logMsg, value) {
  pinoLogger.warn(logMsg);
  return Promise.resolve(value);
}

function logAndReject(logMsg, error) {
  pinoLogger.warn(logMsg);
  return Promise.reject(error);
}

const CharacterType = new GraphQLObjectType({
  name: 'Character',
  fields: {
    id: {
      type: GraphQLString
    },
    name: {
      type: GraphQLString
    },
    profession: {
      type: GraphQLString
    },
    crewMember: {
      type: GraphQLBoolean
    }
  }
});

const ShipType = new GraphQLObjectType({
  name: 'Ship',
  fields: {
    id: {
      type: GraphQLID
    },
    name: {
      type: GraphQLString
    },
    origin: {
      type: GraphQLString
    }
  }
});

const CharacterUpdateInputType = new GraphQLInputObjectType({
  name: 'CharacterUpdateInput',
  fields: {
    id: {
      type: GraphQLID
    },
    name: {
      type: GraphQLString
    },
    profession: {
      type: GraphQLString
    }
  }
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'RootQueryType',
    fields: {
      value: {
        type: new GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: GraphQLBoolean
          }
        },
        resolve(__, { crewMember }) {
          pinoLogger.warn('value');
          return data.filterCharacters(crewMember);
        }
      },
      valueError: {
        type: new GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: GraphQLBoolean
          }
        },
        resolve() {
          pinoLogger.warn('valueError');
          throw new Error('Boom');
        }
      },
      promise: {
        type: new GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: GraphQLBoolean
          }
        },
        resolve(__, { crewMember }) {
          return logAndResolve('promise', data.filterCharacters(crewMember));
        }
      },
      promiseError: {
        type: new GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: GraphQLBoolean
          }
        },
        resolve() {
          return logAndReject('promiseError', new Error('Boom'));
        }
      },
      array: {
        type: new GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: GraphQLBoolean
          }
        },
        resolve() {
          return [logAndResolve('array', data.jim), Promise.resolve(data.naomi), Promise.resolve(data.amos)];
        }
      },
      arrayError: {
        type: new GraphQLList(CharacterType),
        args: {
          crewMember: {
            type: GraphQLBoolean
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
        type: new GraphQLList(ShipType),
        resolve() {
          return data.ships;
        }
      }
    }
  }),

  mutation: new GraphQLObjectType({
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
          return { name, profession };
        }
      }
    }
  })
});

export { schema, pinoLogger };
