'use strict';

// eslint-disable-next-line no-unused-vars
exports.handler = async (event, context) => {
  console.log('Starting up');
  setTimeout(() => {
    console.log('Still running');
  }, 1000);
  return {
    message: 'Stan says hi!'
  };
};
