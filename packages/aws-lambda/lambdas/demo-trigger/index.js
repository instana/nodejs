'use strict';

const instana = require('@instana/aws-lambda');

const async_ = require('async');
const request = require('request-promise');
// eslint-disable-next-line import/no-extraneous-dependencies
const s3 = new (require('aws-sdk')).S3(); // this is provided by AWS, so it is not listed in package.json
const uuid = require('uuid/v4');

const bucket = process.env.BUCKET_NAME || 'instana-lambda-demo';

exports.handler = instana.awsLambda.wrap((event, context, callback) => {
  console.log('Triggering API request.');
  triggerHttpRequest().finally(() => {
    async_.waterfall(
      [
        next =>
          s3.listObjects(
            {
              Bucket: bucket,
              MaxKeys: 100
            },
            next
          ),
        (listObjectsResult, next) => {
          if (!listObjectsResult.Contents || listObjectsResult.Contents.length === 0) {
            setImmediate(next);
          } else {
            s3.deleteObjects(
              {
                Bucket: bucket,
                Delete: {
                  Objects: listObjectsResult.Contents.map(obj => ({
                    Key: obj.Key
                  })),
                  Quiet: true
                }
              },
              next
            );
          }
        },
        (deleteObjectsResult, next) => {
          if (!next && typeof deleteObjectsResult === 'function') {
            next = deleteObjectsResult;
          }
          s3.putObject(
            {
              Bucket: bucket,
              Key: `dummy-s3-${uuid().substring(0, 7)}`,
              Body: ''
            },
            next
          );
        }
      ],

      err => {
        if (err) {
          console.error('An error occured while processing S3 tasks: ', err);
          callback(err);
        } else {
          console.log('All S3 tasks done.');
          callback(null, 'success');
        }
      }
    );
  });
});

function triggerHttpRequest() {
  let method;
  let url;
  const r = Math.random();
  let body;
  if (r < 0.333) {
    // list items
    method = 'GET';
    url = 'https://wn69a84ebf.execute-api.us-east-2.amazonaws.com/default/items';
  } else if (r < 0.66) {
    // create item
    method = 'POST';
    url = 'https://wn69a84ebf.execute-api.us-east-2.amazonaws.com/default/items';
    body = `{"label":"dummy-http-${uuid().substring(0, 7)}"}`;
  } else {
    // load single item (might not exist)
    method = 'GET';
    url = 'https://wn69a84ebf.execute-api.us-east-2.amazonaws.com/default/items/42';
  }

  return request({
    method,
    url,
    body
  })
    .then(() => console.log(`API request successful: ${method} ${url} ${body ? JSON.stringify(body) : ''}`))
    .catch(e => console.error('API request failed:', e));
}
