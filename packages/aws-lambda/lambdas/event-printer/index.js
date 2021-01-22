/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

exports.handler = async (event, context) => {
  console.log('EVENT:');
  console.log(JSON.stringify(event, null, 2));
  console.log('CONTEXT:');
  console.log(JSON.stringify(context, null, 2));
  return {
    message: 'Thanks for playing :)'
  };
};
