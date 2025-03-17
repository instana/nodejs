/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const instana = require('@instana/aws-lambda');
const localUtils = require('./utils');

let wrappedHandler;

if (!wrappedHandler) {
  try {
    const targetHandler = loadTargetHandlerFunction();
    wrappedHandler = instana.wrap(targetHandler);
  } catch (err) {
    // we can throw error from here, but even then there is the delay that we are trying to solve
    // throw new localUtils.errors.lambda.ImportModuleError(err);
    console.error('Not traced', err);
  }
}

exports.handler = function instanaAutowrapHandler(event, context, callback) {
  if (!wrappedHandler) {
    // we can ignore this callback execution, but then the Lambda fn will work only on proper configuration
    // also this need to called because otherwise the Lambda execution result is shown as Succeeded

    //    Status: Succeeded
    //    Test Event Name: test
    //    Response:
    //    null

    return callback.apply(this, arguments);
  } else {
    return wrappedHandler(event, context, callback);
  }
};

function loadTargetHandlerFunction() {
  const {
    targetHandlerModuleFolder, //
    targetHandlerModuleName,
    targetHandlerFunctionName
  } = localUtils.parseHandlerEnvVar();

  const targetHandlerModule = requireTargetHandlerModule(
    process.env.LAMBDA_TASK_ROOT,
    targetHandlerModuleFolder,
    targetHandlerModuleName
  );

  return localUtils.findHandlerFunctionOnModule(targetHandlerModule, targetHandlerFunctionName);
}

function requireTargetHandlerModule(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName) {
  const requirePath = localUtils.getImportPath(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName);

  try {
    return require(requirePath);
  } catch (e) {
    if ('MODULE_NOT_FOUND' === e.code) {
      throw new localUtils.errors.lambda.ImportModuleError(e);
    } else if (
      'ERR_REQUIRE_ESM' === e.code ||
      e.message.indexOf('Cannot use import statement outside a module') !== -1
    ) {
      throw new localUtils.errors.lambda.ImportModuleError(
        'Your Lambda function is using an ES module. ' +
          "Please use the 'instana-aws-lambda-auto-wrap-esm.handler' as runtime handler."
      );
    } else if (e instanceof SyntaxError) {
      throw new localUtils.errors.lambda.UserCodeSyntaxError(e);
    } else {
      throw e;
    }
  }
}
