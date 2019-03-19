exports.handler = (event, context) => {
  context.callbackWaitsForEmptyEventLoop = true;
  console.log('Starting up');
  setTimeout(() => {
    console.log('Still running');
  }, 1000);

  return new Promise((resolve, reject) => {
    resolve({
      message: 'Stan says hi!'
    });
  });
};
