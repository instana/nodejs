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
