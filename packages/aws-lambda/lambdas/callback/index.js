/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

exports.handler = function handler(event, context, callback) {
  console.log('Starting up');
  setTimeout(() => {
    console.log('Still running');
  }, 1000);
  callback(null, {
    message: 'Stan says hi!'
  });
};
