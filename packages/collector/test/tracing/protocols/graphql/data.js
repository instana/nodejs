/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = exports = {
  jim: {
    id: '1',
    name: 'James Holden',
    profession: 'Captain',
    crewMember: true
  },
  naomi: {
    id: '2',
    name: 'Naomi Nagata',
    profession: 'Executive Officer',
    crewMember: true
  },
  amos: {
    id: '3',
    name: 'Amos Burton',
    profession: 'Mechanic',
    crewMember: true
  },
  josephus: {
    id: '4',
    name: 'Josephus Miller',
    profession: 'Detective',
    crewMember: false
  },

  canterbury: {
    id: '1',
    name: 'Canterbury',
    origin: 'Ceres'
  },
  roccinante: {
    id: '2',
    name: 'Roccinante',
    origin: 'Mars'
  }
};

exports.characters = [exports.jim, exports.naomi, exports.amos, exports.josephus];
exports.ships = [exports.canterbury, exports.roccinante];

exports.filterCharacters = function filterCharacters(crewMember) {
  // eslint-disable-next-line eqeqeq
  if (crewMember == null) {
    return exports.characters;
  }
  // eslint-disable-next-line eqeqeq
  return exports.characters.filter(character => character.crewMember == crewMember);
};
