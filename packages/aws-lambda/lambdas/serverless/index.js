/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

import _ from 'lodash';

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const doSomething = async () => {
  await timeout(500);
  return _.find([{ id: 1 }, { id: 2 }, { id: 3 }], thing => thing.id === 2);
};

export const webpackHandler = async () => {
  try {
    const result = await doSomething();
    console.info('done');
    return {
      statusCode: 200,
      body: result
    };
  } catch (error) {
    return {
      statusCode: 500,
      message: error
    };
  }
};
