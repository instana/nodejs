'use strict';

/**
 * Simulates the AWS Lambda runtime.
 */

const path = require('path');

const sendToParent = require('../../../serverless/test/util/send_to_parent');

const logPrefix = `aws-lambda-runtime-mock (${process.pid})`;
const log = require('../../../serverless/test/util/log')(logPrefix);

const uncaughtExceptionEventName = 'uncaughtException';

let definitionPath;
let lambdaDefinition;

/**
 * Validates and runs the lambda handler specified by process.env.HANDLER_DEFINITION_PATH.
 */
function main() {
  const definitionRelativePath = process.env.HANDLER_DEFINITION_PATH;
  if (!definitionRelativePath) {
    log('No handler definition path given. Please set the environment variable HANDLER_DEFINITION_PATH.');
    terminate(true);
    return;
  }
  definitionPath = path.resolve(definitionRelativePath);
  // eslint-disable-next-line import/no-dynamic-require
  lambdaDefinition = require(definitionPath);
  validateDefinition(lambdaDefinition);
  process.on('message', cmd => {
    if (cmd === 'run-handler') {
      runHandler(lambdaDefinition.handler, process.env.LAMDBA_ERROR);
    }
  });
  sendToParent('runtime: started');
}

/**
 * Validates the lambda handler definition.
 */
function validateDefinition() {
  log(`Inspecting Lambda definition ${definitionPath}.`);
  if (!lambdaDefinition.handler) {
    log(`Lambda definition ${definitionPath} does not export a handler.`);
    terminate(true);
  } else if (typeof lambdaDefinition.handler !== 'function') {
    log(
      `Lambda definition ${definitionPath} exports a property handler, but it is not a function. Instead it has type ` +
        `${typeof lambdaDefinition.handler}.`
    );
    terminate(true);
  } else if (lambdaDefinition.handler.length > 3) {
    log(
      `Lambda definition ${definitionPath} handler function has an unexpected number of arguments. Expecting up to ` +
        '3 arguments (promise/async API or callback API). But the handler function takes ' +
        `${lambdaDefinition.handler.length} arguments.`
    );
    terminate(true);
  }
}

/**
 * Runs the given lambda handler.
 */
function runHandler(handler, error) {
  const event = createEvent(error);
  registerErrorHandling();
  log(`Running ${definitionPath}.`);

  let handlerHasFinished = false;
  const callback = function(err, result) {
    if (handlerHasFinished) {
      return;
    }
    handlerHasFinished = true;
    unregisterErrorHandling();
    if (err) {
      log(`Lambda ${definitionPath} handler has failed:`);
      log(err);
      sendToParent({
        type: 'lambda-result',
        error: true,
        payload: { message: err.message }
      });
      return;
    }
    log(`Lambda ${definitionPath} handler has returned successfully, result: ${JSON.stringify(result)}.`);
    sendToParent({
      type: 'lambda-result',
      error: false,
      payload: result
    });
  };

  const context = createContext(callback);

  const promise = handler(event, context, callback);

  if (promise && typeof promise.then === 'function') {
    promise.then(
      result => {
        if (handlerHasFinished) {
          throw new Error(
            'The promise returned by the handler has resolved after the handler has already finished via callback'
          );
        }
        handlerHasFinished = true;
        unregisterErrorHandling();
        log(`Lambda ${definitionPath} handler has returned successfully, result: ${JSON.stringify(result)}.`);
        sendToParent({
          type: 'lambda-result',
          error: false,
          payload: result
        });
      },
      err => {
        if (handlerHasFinished) {
          throw new Error(
            'The promise returned by the handler has been rejected after the handler has already finished via callback'
          );
        }
        handlerHasFinished = true;
        unregisterErrorHandling();
        log(`Lambda ${definitionPath} handler has failed:`);
        log(err);
        sendToParent({
          type: 'lambda-result',
          error: true,
          payload: { message: err.message }
        });
      }
    );
  }
}

function createContext(callback) {
  const functionName = process.env.LAMBDA_FUNCTION_NAME ? process.env.LAMBDA_FUNCTION_NAME : 'functionName';
  const functionVersion = process.env.LAMBDA_FUNCTION_VERSION ? process.env.LAMBDA_FUNCTION_VERSION : '$LATEST';
  const alias = process.env.LAMBDA_FUNCTION_ALIAS;
  const invokedFunctionArn = alias
    ? `arn:aws:lambda:us-east-2:410797082306:function:${functionName}:${process.env.LAMBDA_FUNCTION_ALIAS}`
    : `arn:aws:lambda:us-east-2:410797082306:function:${functionName}`;

  const done = (err, result) => {
    callback(err, result);
  };
  const succeed = result => {
    done(null, result);
  };
  const fail = err => {
    if (err == null) {
      done('handled');
    } else {
      done(err, null);
    }
  };

  return {
    callbackWaitsForEmptyEventLoop: false,
    logGroupName: '/aws/lambda/logGroup',
    logStreamName: `2019/03/19/[${functionVersion}]056cc3b39a364bd4959264dba2ed7011`,
    functionName,
    memoryLimitInMB: '128',
    functionVersion,
    invokeid: '20024b9e-e726-40e2-915e-f787357738f7',
    awsRequestId: '20024b9e-e726-40e2-915e-f787357738f7',
    invokedFunctionArn,
    done,
    succeed,
    fail
  };
}

function createEvent(error) {
  /* eslint-disable default-case */
  const event = {};

  if (error != null) {
    event.error = error;
  }
  if (process.env.HTTP_STATUS_CODE) {
    event.requestedStatusCode = process.env.HTTP_STATUS_CODE;
  }

  const trigger = process.env.LAMBDA_TRIGGER;
  if (trigger != null) {
    switch (trigger) {
      case 'api-gateway-no-proxy':
        break;

      case 'api-gateway-proxy':
        event.resource = '/path/to/{param1}/{param2}';
        event.path = '/path/to/path-xxx/path-yyy';
        event.httpMethod = 'POST';
        event.headers = {
          'X-mY-favorite-header': 'A Header Value',
          'Another-Header': 'Another Header Value'
        };
        event.multiValueHeaders = {
          'x-test-header-1': ['header-value', 'another-header-value'],
          'x-test-header-2': ['header-value']
        };
        event.queryStringParameters = {
          param1: 'another-param-value',
          param2: 'param-value'
        };
        event.multiValueQueryStringParameters = {
          param1: ['param-value', 'another-param-value'],
          param2: ['param-value']
        };
        event.pathParameters = {
          param1: 'path-xxx',
          param2: 'path-yyy'
        };
        event.body = '{\n    "test": "with body"\n}';
        addHttpTracingHeaders(event);
        break;

      case 'application-load-balancer':
        event.requestContext = {
          elb: {
            targetGroupArn:
              'arn:aws:elasticloadbalancing:us-east-2:410797082306:targetgroup/' +
              'lambda-trigger-test-group/752535aa89ba8d62'
          }
        };
        event.httpMethod = 'GET';
        event.path = '/path/to/resource';
        event.queryStringParameters = {
          param1: 'value1',
          param2: 'value2'
        };
        event.headers = {
          accept: '*/*',
          host: 'lambda-trigger-test-XXXXXXXXXX.us-east-2.elb.amazonaws.com',
          'user-agent': 'curl/7.54.0',
          'x-amzn-trace-id': 'Root=1-5d886fff-8f876915462336bXXXXXXXXX',
          'x-forwarded-for': '2.204.181.152',
          'x-forwarded-port': '80',
          'x-forwarded-proto': 'http',
          'X-mY-favorite-header': 'A Header Value',
          'Another-Header': 'Another Header Value'
        };
        event.body = '';
        event.isBase64Encoded = false;
        addHttpTracingHeaders(event);
        break;

      case 'cloudwatch-events':
        event.source = 'aws.events';
        event['detail-type'] = 'Scheduled Event';
        event.resources = ['arn:aws:events:us-east-2:XXXXXXXXXXXX:rule/lambda-tracing-trigger-test'];
        break;

      case 'cloudwatch-logs':
        event.awslogs = {
          data:
            'H4sIAAAAAAAAAK1TWW/UMBD+K1bEA0jNxveRt60aKiQKVXd5oakqJ3FKaC4cbw+q/ncm21YgQcVWEFmRMzP2fMfkLurcNNkLt74dXZRG' +
            'B8v18vwoW62Wh1m0Fw3XvfMQ5gQro7CmDEsIt8PFoR82I2QSez0lre2KyialbdvClpfn+pzgh7JV8M52UEcxMQmGpZPTV++X62y1PmOF' +
            'IoUstCwl4ZyRoiKOU6N4rV1hNIErpk0xlb4ZQzP0b5s2OD9F6Wn01CkOQ+yuXB/i0Tc9ZON6WxSdbbtnc2o+cBc1FYBg3EhgoQXhWGkM' +
            'n0wKgwVVQnNNBJOGGYKpVIxriEmilOaMApDQgFDBdsCZCAliaK7gzfeeBHzkGGNYek1JynjK1MIo9jkPjhnopuqY8cLF3AoZa1PUsRKW' +
            'ElNXlhYsD6tgfWj6C7QZ8z663/sdNcGYMSE1URpgawquCAk7gg01hmlGmWJSAXTNzfOoxd9Ri51Rz5OTeT/4FD3ZgpoJ9UNAFtWbvpy9' +
            'y3sEjw3I3YyDD9Pii+2r1nn0OrmyPgl2ukyavnI3i69TqlL25s8CCNiCJ5xQg4EmI5hpDXvBGAV+0hCwUYGBkhIunxEAjCe/CpB9OEAn' +
            '7tsGCt9VKdqJ9b+jUzuiO8mOP56sXwwwHGy8nZVPkdALglE35WG/aVtXoZ8pmCdIoDwcuW7wt2jVfHcQpRod7UPQ3qDHxKfJVfNN2/h/' +
            'YK93Zf8y2ujYDyUchjFrAjAtXD14h8qhG1u3/bX8w4V5P5M4u/8BWHOedgAFAAA='
        };
        break;

      case 's3':
        event.Records = [
          {
            eventVersion: '2.1',
            eventSource: 'aws:s3',
            awsRegion: 'us-east-2',
            eventTime: '2019-09-08T21:53:56.900Z',
            eventName: 'ObjectCreated:Put',
            userIdentity: {
              principalId: 'AWS:XXXXXXXXXXXXXXXXXXXXX:edgar.example@example.com'
            },
            requestParameters: {
              sourceIPAddress: '123.123.123.42'
            },
            responseElements: {
              'x-amz-request-id': 'XXXXXXXXXXXXXXXX',
              'x-amz-id-2': 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX='
            },
            s3: {
              s3SchemaVersion: '1.0',
              configurationId: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
              bucket: {
                name: 'lambda-tracing-test',
                ownerIdentity: {
                  principalId: 'XXXXXXXXXXXXX'
                },
                arn: 'arn:aws:s3:::lambda-tracing-test'
              },
              object: {
                key: 'test/',
                size: 0,
                eTag: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                sequencer: 'XXXXXXXXXXXXXXXXXX'
              }
            }
          },
          {
            eventSource: 'aws:s3',
            eventName: 'ObjectCreated:Put',
            s3: {
              bucket: {
                name: 'lambda-tracing-test-2'
              },
              object: {
                key: 'test/two'
              }
            }
          },
          {
            eventSource: 'aws:s3',
            eventName: 'ObjectCreated:Put',
            s3: {
              bucket: {
                name: 'lambda-tracing-test-3'
              },
              object: {
                key: 'test/three'
              }
            }
          },
          {
            eventSource: 'aws:s3',
            eventName: 'ObjectCreated:Put',
            s3: {
              bucket: {
                name: 'lambda-tracing-test-4'
              },
              object: {
                key: 'test/four'
              }
            }
          }
        ];
        break;

      case 'sqs':
        event.Records = [
          {
            messageId: '420440d5-8733-43d9-b93c-ad1305889995',
            receiptHandle:
              'AQEB4Sk+tR+qMK5ss+ZRB9h61fG3IQKnBUXsoQNJ+kLYADC16buCksferm4JtPM0SbqDfKWdtnnLFOPU69iISv3lVsI6t+T5FhD126' +
              'yVoVMEu4Pw5ethWk9RRGWPkEgZcbV4WPU89gQC/u0lFdwtODnCxMvJZwW6cvtbX0yOPwGjmry3xj4wFNHG59U2QDTLaEQicsbo7YJJ' +
              '6wXhHPl07/UIN5vIvPUhnHvAd37KeVy7dbRBugjq8UQk6APawf9RfNQRLkm9IXeXY8ZRCDDZaVkFDxWXfksaMrBZPNyOitQGvyxmmr' +
              'm0yJbC/SMnh1Dohdwqq6Oc4XYVi7sI7YKt6lermIxF4Y8V3AUjvUte6fyzQZlXgzb4O8us6+yzhHUW9irwNlhWGF4WAgzUFscht2EQ' +
              'fQ==',
            body: '{\n  "body-1": "value-1",\n  "body-2": value-2"\n}',
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1569264666807',
              SenderId: 'XXXXXXXXXXXXXXXXXXXXX',
              ApproximateFirstReceiveTimestamp: '1569264666810'
            },
            messageAttributes: {
              'param-1': {
                stringValue: 'another-value',
                stringListValues: [],
                binaryListValues: [],
                dataType: 'String'
              },
              'param-2': {
                stringValue: 'value-2',
                stringListValues: [],
                binaryListValues: [],
                dataType: 'String'
              }
            },
            md5OfBody: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            md5OfMessageAttributes: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-east-2:XXXXXXXXXXXX:lambda-tracing-test-queue',
            awsRegion: 'us-east-2'
          }
        ];
        break;

      default:
        throw new Error(`Unknown trigger type: ${trigger}.`);
    }
  }
  return event;
}

function addHttpTracingHeaders(event) {
  if (process.env.INSTANA_HEADER_T) {
    event.headers['x-InStaNa-t'] = process.env.INSTANA_HEADER_T;
  }
  if (process.env.INSTANA_HEADER_S) {
    event.headers['x-InStaNa-S'] = process.env.INSTANA_HEADER_S;
  }
  if (process.env.INSTANA_HEADER_L) {
    event.headers['x-InStaNa-l'] = process.env.INSTANA_HEADER_L;
  }
}

function registerErrorHandling() {
  process.on(uncaughtExceptionEventName, onUncaughtException);
}

function onUncaughtException(error) {
  if (error.message === 'Boom!') {
    // this is an intended error that is part of the test for synchronous error handling.
    log(
      `! Lambda ${definitionPath} handler has thronw runtime error ` +
        `(possibly an expected error as part of the test): ${error.message}.`
    );
    unregisterErrorHandling();
    sendToParent({
      type: 'lambda-result',
      error: true,
      payload: { message: error.message }
    });
    return;
  }

  log(`! Lambda ${definitionPath} handler has failed with an unexpected runtime error: ${error.message}`);
  throw error;
}

function unregisterErrorHandling() {
  process.removeListener(uncaughtExceptionEventName, onUncaughtException);
}

function terminate(error) {
  sendToParent('runtime: terminating');
  process.exit(error ? 1 : 0);
}

main();
