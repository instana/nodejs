/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const instana = require('@instana/aws-lambda');
const localUtils = require('./utils');

const majorNodeVersion = Number(process.versions.node.split('.')[0]);

// CASE: ES support was added in Node v14, throw error if the handler is used in < 14
// NOTE: The esm handler can be used for Lambdas with commonjs or es module.
//       See https://github.com/nodejs/node/pull/35249
// NOTE: Theoretically you can use this handler with Node > 10, because in Node v12
//       dynamic imports were added. But as soon as we switch to a real ES module
//       we will no longer use dynamic imports. We might use top level imports.
if (majorNodeVersion < 14) {
  throw new localUtils.errors.lambda.ImportModuleError(
    `ES Module support was added in Node v14. Your Lambda function is using ${majorNodeVersion}.` +
      "Please use the 'instana-aws-lambda-auto-wrap.handler' as runtime handler."
  );
}

exports.handler = async function instanaAutowrapHandler(event, context, callback) {
  const targetHandler = await loadTargetHandlerFunction();
  const wrappedHandler = instana.wrap(targetHandler);
  return wrappedHandler(event, context, callback);
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
