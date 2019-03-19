const instana = require('instana-serverless-nodejs');

exports.handler = instana.awsLambda.wrap(function(event, context, callback) {
  console.log('in actual handler');
  if (event.error) {
    callback(new Error('Boom!'));
  } else {
    callback(null, {
      message: 'Stan says hi!'
    });
  }
});
