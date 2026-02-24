/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

let instana;
let semver;
let localUtils;
let wrappedHandler;
let capturedError;
let initStartTime;

// Node.js 24+ removed support for callback-based handlers (3 parameters).
// For Node.js < 24, we preserve the callback signature for backward compatibility.
function isLatestRuntime() {
  if (!semver) {
    // eslint-disable-next-line instana/no-unsafe-require
    semver = require('semver');
  }
  return semver.gte(process.version, '24.0.0');
}

function initializeHandler() {
  if (wrappedHandler || capturedError) {
    return;
  }

  try {
    initStartTime = Date.now();

    instana = require('@instana/aws-lambda');
    localUtils = require('./utils');

    const loadTime = Date.now() - initStartTime;
    // eslint-disable-next-line no-console
    console.log(`[Instana] Dependencies loaded in ${loadTime}ms`);

    const targetHandler = loadTargetHandlerFunction();
    wrappedHandler = instana.wrap(targetHandler);

    const totalTime = Date.now() - initStartTime;
    // eslint-disable-next-line no-console
    console.log(`[Instana] Handler initialization completed in ${totalTime}ms`);
  } catch (e) {
    capturedError = e;
    // eslint-disable-next-line no-console
    console.error('[Instana] Handler initialization failed:', e.message);
  }
}

if (isLatestRuntime()) {
  exports.handler = async function instanaAutowrapHandler(event, context) {
    initializeHandler();

    if (capturedError) {
      throw capturedError;
    }

    return wrappedHandler(event, context);
  };
} else {
  exports.handler = function instanaAutowrapHandler(event, context, callback) {
    initializeHandler();

    if (capturedError) {
      return callback(capturedError);
    }

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
