/*
 * (c) Copyright IBM Corp. 2022
 */

import https from 'https';

export const candle = async (event, context) => {
  const promise = new Promise(function (resolve, reject) {
    https
      .get('https://www.example.com', res => {
        resolve(res.statusCode);
      })
      .on('error', e => {
        reject(Error(e));
      });
  });
  return promise;
};
