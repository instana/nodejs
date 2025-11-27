/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const instana = require('@instana/aws-lambda');
const localUtils = require('./utils');

let wrappedHandler;
let capturedError;

if (!wrappedHandler) {
  try {
    const targetHandler = loadTargetHandlerFunction();
    wrappedHandler = instana.wrap(targetHandler);
  } catch (e) {
    capturedError = e;
  }
}

exports.handler = async function instanaAutowrapHandler(event, context) {
  if (!wrappedHandler) {
    throw capturedError;
  }

  return wrappedHandler(event, context);
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
        'Your Lambda function is an ECMAScript module (ESM). ' +
          "Please use the 'instana-aws-lambda-auto-wrap-esm.handler' as runtime handler."
      );
    } else if (e instanceof SyntaxError) {
      throw new localUtils.errors.lambda.UserCodeSyntaxError(e);
    } else {
      throw e;
    }
  }
}
