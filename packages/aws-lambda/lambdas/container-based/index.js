/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

exports.handler = async () => {
  console.log('Executing simple-nodejs-lambda handler');

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Stan says hi!'
    })
  };
};
