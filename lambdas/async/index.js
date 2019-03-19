exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = true;
  console.log('Starting up');
  setTimeout(() => {
    console.log('Still running');
  }, 1000);
  return {
    message: 'Stan says hi!'
  };
};
