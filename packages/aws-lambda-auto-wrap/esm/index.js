/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const instana = require('@instana/aws-lambda');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const localUtils = require('./utils');

// NOTE: The esm handler can be used for Lambdas with commonjs or es module.
//       See https://github.com/nodejs/node/pull/35249
if (!supportedVersion(process.versions.node)) {
  throw new localUtils.errors.lambda.ImportModuleError(
    `Your Lambda function is using ${process.versions.node}. This version is not supported.` +
      'Please use a layer version which is compatible with your Node.js version.' +
      'See https://www.ibm.com/docs/en/instana-observability/current?topic=lambda-aws-native-tracing-nodejs'
  );
}

exports.handler = async function instanaAutowrapHandler(event, context) {
  const targetHandler = await loadTargetHandlerFunction();
  const wrappedHandler = instana.wrap(targetHandler);
  return wrappedHandler(event, context);
};

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
