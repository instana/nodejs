/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');
const requireHook = require('../../../../../util/requireHook');
const { getFunctionArguments } = require('../../../../../util/function_arguments');

/** @type {Array.<import('./instana_aws_product').InstanaAWSProduct}> */
const awsProducts = [
  //
  require('./dynamodb')
];

/** @type {Object.<string, import('./instana_aws_product').InstanaAWSProduct} */
const operationMap = {};

awsProducts.forEach(awsProduct => {
  Object.assign(operationMap, awsProduct.getOperations());
});

let isActive = false;

exports.init = function init() {
  requireHook.onFileLoad(/@aws-sdk\/middleware-logger\/dist\/cjs\/loggerMiddleware\.js/, instrumentAWS);
};

exports.isActive = function () {
  return isActive;
};

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function instrumentAWS(AWS) {
  shimmer.wrap(AWS, 'loggerMiddleware', shimLoggerMiddleware);
}

function shimLoggerMiddleware(originalLoggerMiddleware) {
  // const loggerMiddleware = () => (next, context) => async (args) => {...}

  return function () {
    const self = this;
    const loggerMiddlewareArgs = getFunctionArguments(arguments);

    // (next, context) => async (args) => {...}
    const innerFunction = originalLoggerMiddleware.apply(this, loggerMiddlewareArgs);

    return function () {
      // async (args) => {...}
      const innerFunctionArgs = getFunctionArguments(arguments);
      const anotherInnerFunc = innerFunction.apply(self, innerFunctionArgs);
      return function () {
        if (isActive) {
          const anotherInnerFuncArgs = getFunctionArguments(arguments);

          const awsProduct = operationMap[innerFunctionArgs[1].commandName];

          if (awsProduct) {
            return awsProduct.instrumentedInnerLoggerMiddleware(
              self,
              anotherInnerFunc,
              anotherInnerFuncArgs,
              innerFunctionArgs
            );
          }

          return anotherInnerFunc.apply(self, anotherInnerFuncArgs);
        }
        return anotherInnerFunc.apply(self, arguments);
      };
    };
  };
}
