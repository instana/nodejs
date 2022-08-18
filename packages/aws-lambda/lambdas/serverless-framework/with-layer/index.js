/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

exports.handler = async () => {
  return {
    statusCode: 200,
    body: 'Hello from Lambda layer'
  };
};
