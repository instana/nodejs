'use strict';

exports.handler = function(event, context, callback) {
  context.callbackWaitsForEmptyEventLoop = true;
  console.log('Starting up');
  setTimeout(() => {
    console.log('Still running');
  }, 1000);
  callback(null, {
    message: 'Stan says hi!'
  });
};
