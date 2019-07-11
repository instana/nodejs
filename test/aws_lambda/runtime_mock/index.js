'use strict';

/**
 * Simulates the AWS Lambda runtime.
 */
const path = require('path');

const sendToParent = require('../../util/send_to_parent');

const logPrefix = `aws-lambda-runtime-mock (${process.pid})`;
const log = require('../../util/log')(logPrefix);

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
  runHandler(lambdaDefinition.handler, process.env.LAMDBA_ERROR === 'true');
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
  const context = createContext();
  const event = createEvent(error);
  registerErrorHandling();
  log(`Running ${definitionPath}.`);

  let handlerHasFinished = false;
  const promise = handler(event, context, (err, result) => {
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

      // eslint-disable-next-line consistent-return
      return terminate(true);
    }
    log(`Lambda ${definitionPath} handler has returned successfully, result: ${JSON.stringify(result)}.`);
    sendToParent({
      type: 'lambda-result',
      error: false,
      payload: result
    });
    // eslint-disable-next-line consistent-return
    return terminate();
  });

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
        return terminate();
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
        return terminate(true);
      }
    );
  }
}

function createContext() {
  return {
    callbackWaitsForEmptyEventLoop: false,
    logGroupName: '/aws/lambda/logGroup',
    logStreamName: '2019/03/19/[$LATEST]056cc3b39a364bd4959264dba2ed7011',
    functionName: 'functionName',
    memoryLimitInMB: '128',
    functionVersion: '$LATEST',
    invokeid: '20024b9e-e726-40e2-915e-f787357738f7',
    awsRequestId: '20024b9e-e726-40e2-915e-f787357738f7',
    invokedFunctionArn: 'arn:aws:lambda:us-east-2:410797082306:function:functionName'
  };
}

function createEvent(error) {
  return {
    error
  };
}

function registerErrorHandling() {
  process.on(uncaughtExceptionEventName, onUncaughtException);
}

function onUncaughtException(error) {
  log(`! Lambda ${definitionPath} handler has failed with a runtime error:"${error.message}`);
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
