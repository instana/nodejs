/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { uninstrumentedFs: fs } = require('@instana/core');
const path = require('path');

const SPLIT_AT_DOT_REGEX = /^([^.]*)\.(.*)$/;
const TWO_DOTS = '..';
const DEFAULT_HANDLER = 'index.handler';

class HandlerNotFound extends Error {}
class MalformedHandlerName extends Error {}
class UserCodeSyntaxError extends Error {}
class ImportModuleError extends Error {}

const lambdaRuntimeErrorsFallback = {
  HandlerNotFound,
  MalformedHandlerName,
  UserCodeSyntaxError,
  ImportModuleError
};

let lambdaRuntimeErrors;

const errors = {
  get lambda() {
    return getLambdaRuntimeErrors();
  }
};

function getLambdaRuntimeErrors() {
  if (lambdaRuntimeErrors) {
    return lambdaRuntimeErrors;
  }
  return lambdaRuntimeErrorsFallback;
}

function parseHandlerEnvVar() {
  const targetHandlerEnvVar = getLambdaHandlerEnvVar();

  if (targetHandlerEnvVar.indexOf(TWO_DOTS) >= 0) {
    throw new errors.lambda.MalformedHandlerName(
      `'${targetHandlerEnvVar}' is not a valid handler name. Use absolute paths when specifying root directories in ` +
        'handler names.'
    );
  }
  const handlerModuleAndFunction = path.basename(targetHandlerEnvVar);
  const startIndex = targetHandlerEnvVar.indexOf(handlerModuleAndFunction);
  const targetHandlerModuleFolder = targetHandlerEnvVar.substring(0, startIndex);
  const moduleAndFunctionMatch = handlerModuleAndFunction.match(SPLIT_AT_DOT_REGEX);

  if (!moduleAndFunctionMatch || moduleAndFunctionMatch.length !== 3) {
    throw new errors.lambda.MalformedHandlerName('Bad handler');
  }

  return {
    targetHandlerModuleFolder, //
    targetHandlerModuleName: moduleAndFunctionMatch[1],
    targetHandlerFunctionName: moduleAndFunctionMatch[2]
  };
}

function getFullModulePath(m) {
  if (fs.existsSync(`${m}.js`)) {
    return `${m}.js`;
  }
  if (fs.existsSync(`${m}.cjs`)) {
    return `${m}.cjs`;
  }
  // NOTE: We only use the mjs file ending here to be able to throw a good error
  if (fs.existsSync(`${m}.mjs`)) {
    return `${m}.mjs`;
  }
  if (fs.existsSync(m)) {
    return m;
  }

  return false;
}

function findHandlerFunctionOnModule(targetHandlerModuleObject, targetHandlerFunctionName) {
  const pathToFunction = targetHandlerFunctionName.split('.');
  const targetHandlerFunction = pathToFunction.reduce(
    (obj, pathFragment) => obj && obj[pathFragment],
    targetHandlerModuleObject
  );

  if (!targetHandlerFunction) {
    throw new errors.lambda.HandlerNotFound(`${targetHandlerFunctionName} is undefined or not exported`);
  }

  if (typeof targetHandlerFunction !== 'function') {
    throw new errors.lambda.HandlerNotFound(`${targetHandlerFunctionName} is not a function`);
  }

  return targetHandlerFunction;
}

function getLambdaHandlerEnvVar() {
  let targetHandlerEnvVar = process.env.LAMBDA_HANDLER;
  if (!targetHandlerEnvVar || targetHandlerEnvVar.length === 0) {
    targetHandlerEnvVar = DEFAULT_HANDLER;
  }

  return targetHandlerEnvVar;
}

function getImportPath(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName) {
  const directPath = path.resolve(lambdaTaskRoot, targetHandlerModuleFolder, targetHandlerModuleName);
  let importPath = getFullModulePath(directPath);

  if (!importPath) {
    const lookupRoots = { paths: [lambdaTaskRoot, targetHandlerModuleFolder] };

    try {
      importPath = require.resolve(targetHandlerModuleName, lookupRoots);
    } catch (resolveErr) {
      if ('MODULE_NOT_FOUND' === resolveErr.code) {
        throw new errors.lambda.ImportModuleError(resolveErr);
      } else {
        throw resolveErr;
      }
    }
  }

  return importPath;
}

module.exports = {
  getLambdaHandlerEnvVar,
  errors,
  getImportPath,
  getFullModulePath,
  findHandlerFunctionOnModule,
  parseHandlerEnvVar
};
