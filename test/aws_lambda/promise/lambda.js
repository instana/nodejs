const instana = require('../../..');

exports.handler = instana.awsLambda.wrap((event, context) => {
  console.log('in actual handler');

  return new Promise((resolve, reject) => {
    if (event.error) {
      reject(new Error('Boom!'));
    } else {
      resolve({
        message: 'Stan says hi!'
      });
    }
  });
});
