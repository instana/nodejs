'use strict';

const instana = require('@instana/aws-lambda');

const fs = require('fs');
const path = require('path');

const DEFAULT_HANDLER = 'index.handler';
const RUNTIME_PATH = '/var/runtime';
const SPLIT_AT_DOT_REGEX = /^([^.]*)\.(.*)$/;
const TWO_DOTS = '..';

const lambdaRuntimeErrors = require(`${RUNTIME_PATH}/Errors.js`);

let wrappedHandler;

if (!wrappedHandler) {
  const targetHandler = loadTargetHandlerFunction();
  wrappedHandler = instana.wrap(targetHandler);
}

exports.handler = function instanaAutowrapHandler(event, context, callback) {
  return wrappedHandler(event, context, callback);
};

function loadTargetHandlerFunction() {
  let targetHandlerEnvVar = process.env.LAMBDA_HANDLER;
  if (!targetHandlerEnvVar || targetHandlerEnvVar.length === 0) {
    targetHandlerEnvVar = DEFAULT_HANDLER;
  }

  const {
    targetHandlerModuleFolder, //
    targetHandlerModuleName,
    targetHandlerFunctionName
  } = parseHandlerEnvVar(targetHandlerEnvVar);
  const targetHandlerModule = requireTargetHandlerModule(
    process.env.LAMBDA_TASK_ROOT,
    targetHandlerModuleFolder,
    targetHandlerModuleName
  );
  const targetHandlerFunction = findHandlerFunctionOnModule(targetHandlerModule, targetHandlerFunctionName);

  if (!targetHandlerFunction) {
    throw new lambdaRuntimeErrors.HandlerNotFound(`${targetHandlerEnvVar} is undefined or not exported`);
  }
  if (typeof targetHandlerFunction !== 'function') {
    throw new lambdaRuntimeErrors.HandlerNotFound(`${targetHandlerEnvVar} is not a function`);
  }
  return targetHandlerFunction;
}

function parseHandlerEnvVar(targetHandlerEnvVar) {
  if (targetHandlerEnvVar.indexOf(TWO_DOTS) >= 0) {
    throw new lambdaRuntimeErrors.MalformedHandlerName(
      `'${targetHandlerEnvVar}' is not a valid handler name. Use absolute paths when specifying root directories in ` +
        'handler names.'
    );
  }
  const handlerModuleAndFunction = path.basename(targetHandlerEnvVar);
  const startIndex = targetHandlerEnvVar.indexOf(handlerModuleAndFunction);
  const targetHandlerModuleFolder = targetHandlerEnvVar.substring(0, startIndex);
  const moduleAndFunctionMatch = handlerModuleAndFunction.match(SPLIT_AT_DOT_REGEX);
  if (!moduleAndFunctionMatch || moduleAndFunctionMatch.length !== 3) {
    throw new lambdaRuntimeErrors.MalformedHandlerName('Bad handler');
  }
  return {
    targetHandlerModuleFolder, //
    targetHandlerModuleName: moduleAndFunctionMatch[1],
    targetHandlerFunctionName: moduleAndFunctionMatch[2]
  };
}

function requireTargetHandlerModule(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName) {
  try {
    return attemptRequire(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName);
  } catch (e) {
    if ('MODULE_NOT_FOUND' === e.code) {
      throw new lambdaRuntimeErrors.ImportModuleError(e);
    } else if (e instanceof SyntaxError) {
      throw new lambdaRuntimeErrors.UserCodeSyntaxError(e);
    } else {
      throw e;
    }
  }
}

function attemptRequire(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName) {
  const directPath = path.resolve(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName);
  if (moduleFileExists(directPath)) {
    return require(directPath);
  } else {
    const lookupRoots = { paths: [lambdaTaskRoot, targetHandlerModuleFolder] };
    const pathWithAlternativeLookupRootFolders = require.resolve(targetHandlerModuleName, lookupRoots);
    return require(pathWithAlternativeLookupRootFolders);
  }
}

function moduleFileExists(m) {
  return fs.existsSync(`${m}.js`) || fs.existsSync(m);
}

function findHandlerFunctionOnModule(targetHandlerModuleObject, targetHandlerFunctionName) {
  const pathToFunction = targetHandlerFunctionName.split('.');
  return pathToFunction.reduce((obj, pathFragment) => obj && obj[pathFragment], targetHandlerModuleObject);
}
