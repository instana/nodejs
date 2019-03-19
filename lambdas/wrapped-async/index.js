const instana = require('instana-serverless-nodejs');

exports.handler = instana.awsLambda.wrap(async (event, context) => {
  console.log('in actual handler');
  if (event.error) {
    throw new Error('Boom!');
  } else {
    return {
      message: 'Stan says hi!'
    };
  }
});
