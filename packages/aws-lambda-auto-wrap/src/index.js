/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const instana = require('@instana/aws-lambda');
const localUtils = require('./utils');

let wrappedHandler;

// case 1: return directly from the root
// result: there is a delay of 4 seconds in ap-northeast-1 region
// return;

if (!wrappedHandler) {
  const targetHandler = loadTargetHandlerFunction();
   // case 2: check for the targethandler and then return immediately
   // result: there is 4 sec delay and no logs
    if (!targetHandler) {
      console.log('================= no targetHandler found');
      return;
    } else {
      console.log('================== found', targetHandler);
    }
  wrappedHandler = instana.wrap(targetHandler);
}

exports.handler = function instanaAutowrapHandler(event, context, callback) {
  return wrappedHandler(event, context, callback);
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

//   if (requirePath.endsWith('.mjs')) {
//     throw new localUtils.errors.lambda.ImportModuleError(
//       'Your Lambda function is using an ES module. ' +
//         "Please use the 'instana-aws-lambda-auto-wrap-esm.handler' as runtime handler."
//     );
// }

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
