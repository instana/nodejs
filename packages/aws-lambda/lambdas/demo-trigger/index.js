/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const async_ = require('async');
const pino = require('pino');
const request = require('request-promise');
// eslint-disable-next-line import/no-extraneous-dependencies
const s3 = new (require('aws-sdk').S3)(); // this is provided by AWS, so it is not listed in package.json
const { v4: uuid } = require('uuid');

const bucket = process.env.BUCKET_NAME || 'instana-lambda-demo';
const apiUrl = process.env.API_URL || 'https://wn69a84ebf.execute-api.us-east-2.amazonaws.com';
const fargateUrl = process.env.FARGATE_URL;

const logger = pino();

exports.handler = (event, context, callback) => {
  if (Math.random() >= 0.9) {
    // Throw a synchronous error with probability 1/10.
    throw new Error('Synchronous error in Lambda handler.');
  }

  logger.info('Triggering API request.');
  triggerHttpRequest()
    .then(() => {
      if (fargateUrl) {
        logger.info(`Fargate URL is set, sending request to: ${fargateUrl}`);
        return request({
          url: fargateUrl
        })
          .then(response => logger.info(`Fargate request successful: ${fargateUrl} => ${response}`))
          .catch(e => {
            logger.warn(`Fargate request failed: ${fargateUrl}.`, e.message);
          });
      } else {
        logger.info('Fargate URL is not set, skipping.');
        return Promise.resolve();
      }
    })
    .then(() => {
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
            logger.error(err, 'An error occured while processing S3 tasks.');
            callback(err);
          } else {
            logger.info('All S3 tasks done.');
            callback(null, 'success');
          }
        }
      );
    })
    .catch(errorFromHttpRequest => {
      logger.error(errorFromHttpRequest, 'An error occured when triggering the HTTP request.');
      callback(errorFromHttpRequest);
    });
};

function triggerHttpRequest() {
  let method;
  let url;
  const stage = Math.random() >= 0.33 ? 'default' : 'previous';
  const r = Math.random();
  let body;
  if (r < 0.333) {
    // list items
    method = 'GET';
    url = `${apiUrl}/${stage}/items`;
  } else if (r < 0.66) {
    // create item
    method = 'POST';
    url = `${apiUrl}/${stage}/items`;
    body = `{"label":"dummy-http-${uuid().substring(0, 7)}"}`;
  } else {
    // load single item (might not exist)
    method = 'GET';
    url = `${apiUrl}/${stage}/items/42`;
  }

  return request({
    method,
    url,
    body
  })
    .then(() => logger.info(`API request successful: ${method} ${url} ${body ? JSON.stringify(body) : ''}`))
    .catch(e => {
      if (e.name === 'StatusCodeError' && e.statusCode === 404) {
        // convert 404s into non-errors
        logger.warn(`Not found: ${url}.`);
        return;
      }

      // Rethrow everything else (the API returns an HTTP 500 status every now and then) to propagate the error
      // (and make the trace erroneous).
      throw e;
    });
}
