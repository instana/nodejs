/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const instana = require('@instana/aws-lambda');
// eslint-disable-next-line instana/no-unsafe-require
const semver = require('semver');
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
// Node.js 24+ removed support for callback-based handlers (3 parameters).
// For Node.js < 24, we preserve the callback signature for backward compatibility.
const latestRuntime = semver.gte(process.version, '24.0.0');

if (latestRuntime) {
  exports.handler = async function instanaAutowrapHandler(event, context) {
    if (!wrappedHandler) {
      throw capturedError;
    }

    return wrappedHandler(event, context);
  };
} else {
  exports.handler = function instanaAutowrapHandler(event, context, callback) {
    if (!wrappedHandler) return callback(capturedError);

    return wrappedHandler(event, context, callback);
  };
}

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
