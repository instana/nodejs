/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

let instana;
let supportedVersion;
let localUtils;
let semver;
let wrappedHandler;
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

async function initializeHandler() {
  if (wrappedHandler) {
    return wrappedHandler;
  }

  initStartTime = Date.now();

  instana = require('@instana/aws-lambda');
  supportedVersion = require('@instana/core').tracing.supportedVersion;
  localUtils = require('./utils');

  const loadTime = Date.now() - initStartTime;
  // eslint-disable-next-line no-console
  console.log(`[Instana ESM] Dependencies loaded in ${loadTime}ms`);

  // NOTE: The esm handler can be used for Lambdas with commonjs or es module.
  //       See https://github.com/nodejs/node/pull/35249
  if (!supportedVersion(process.versions.node)) {
    throw new localUtils.errors.lambda.ImportModuleError(
      `Your Lambda function is using ${process.versions.node}. This version is not supported.` +
        'Please use a layer version which is compatible with your Node.js version.' +
        'See https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs'
    );
  }

  const targetHandler = await loadTargetHandlerFunction();
  wrappedHandler = instana.wrap(targetHandler);

  const totalTime = Date.now() - initStartTime;
  // eslint-disable-next-line no-console
  console.log(`[Instana ESM] Handler initialization completed in ${totalTime}ms`);

  return wrappedHandler;
}

if (isLatestRuntime()) {
  exports.handler = async function instanaAutowrapHandler(event, context) {
    const handler = await initializeHandler();
    return handler(event, context);
  };
} else {
  exports.handler = async function instanaAutowrapHandler(event, context, callback) {
    const handler = await initializeHandler();
    return handler(event, context, callback);
  };
}

async function loadTargetHandlerFunction() {
  const {
    targetHandlerModuleFolder, //
    targetHandlerModuleName,
    targetHandlerFunctionName
  } = localUtils.parseHandlerEnvVar();

  // eslint-disable-next-line no-return-await
  const targetHandlerModule = await loadTargetHandlerModule(
    process.env.LAMBDA_TASK_ROOT,
    targetHandlerModuleFolder,
    targetHandlerModuleName
  );

  return localUtils.findHandlerFunctionOnModule(targetHandlerModule, targetHandlerFunctionName);
}

async function loadTargetHandlerModule(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName) {
  const importPath = localUtils.getImportPath(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName);

  try {
    // NOTE: We use dynamic import for now, because ES modules do not work on layers. See README.md
    return await import(importPath);
  } catch (importErr) {
    if ('MODULE_NOT_FOUND' === importErr.code) {
      throw new localUtils.errors.lambda.ImportModuleError(importErr);
    } else if (importErr instanceof SyntaxError) {
      throw new localUtils.errors.lambda.UserCodeSyntaxError(importErr);
    } else {
      throw importErr;
    }
  }
}
