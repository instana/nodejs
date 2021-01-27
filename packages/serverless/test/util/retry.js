/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const config = require('../config');

const wait = ms => new Promise(r => setTimeout(r, ms));

function retry(operation, time = config.getTestTimeout() / 2, until = Date.now() + time) {
  return new Promise((resolve, reject) =>
    operation()
      .then(resolve)
      .catch(reason => {
        if (Date.now() > until) {
          return reject(reason);
        }
        return wait(time / 20)
          .then(retry.bind(null, operation, time, until))
          .then(resolve)
          .catch(reject);
      })
  );
}

module.exports = exports = retry;
