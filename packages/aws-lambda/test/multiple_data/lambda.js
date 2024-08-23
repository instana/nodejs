/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const instana = require('../..');

const https = require('https');
const url = 'https://www.instana.com';

const sendReq = async () => {
  return new Promise(function (resolve, reject) {
    https
      .get(url, () => {
        resolve();
      })
      .on('error', e => {
        reject(Error(e));
      });
  });
};

exports.handler = instana.wrap(async () => {
  const numberOfIterations = process.env.INSTANA_NUMBER_OF_ITERATIONS;
  const tasks = [];

  for (let i = 0; i < numberOfIterations; i++) {
    tasks.push(sendReq());
  }

  await Promise.all(tasks);

  setTimeout(async () => {
    await sendReq();
  }, 500);

  setTimeout(async () => {
    await sendReq();
  }, 1000);

  return {
    statusCode: 200,
    body: {
      message: 'Stan says hi!'
    }
  };
});
