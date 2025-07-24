/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const instana = require('../..');
const http = require('http');
const url = process.env.DOWNSTREAM_DUMMY_URL;

const sendReq = async () => {
  return new Promise(function (resolve, reject) {
    http
      .get(url, () => {
        resolve();
      })
      .on('error', e => {
        reject(Error(e));
      });
  });
};

exports.handler = instana.wrap(
  {
    tracing: {
      enabled: true,
      automaticTracingEnabled: true
    }
  },
  async () => {
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
  }
);
