/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const _ = require('lodash');

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const doSomething = async () => {
  await timeout(500);
  return _.find([{ id: 1 }, { id: 2 }, { id: 3 }], thing => thing.id === 2);
};

exports.handler = async () => {
  const result = await doSomething();

  return {
    statusCode: 200,
    body: result
  };
};
