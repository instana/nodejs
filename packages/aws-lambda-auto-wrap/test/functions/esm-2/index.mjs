/*
 * (c) Copyright IBM Corp. 2022
 */

import https from 'https';

export const handler = async (event, context) => {
  const promise = new Promise(function (resolve, reject) {
    https
      .get('https://www.instana.com', res => {
        resolve(res.statusCode);
      })
      .on('error', e => {
        reject(Error(e));
      });
  });
  return promise;
};
