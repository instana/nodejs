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
  require('./dynamodb'),
  require('./s3'),
  require('./sqs')
];

/** @type {Object.<string, import('./instana_aws_product').InstanaAWSProduct} */
const operationMap = {};

awsProducts.forEach(awsProduct => {
  Object.assign(operationMap, awsProduct.getOperations());
});

let isActive = false;

exports.init = function init() {
  requireHook.onFileLoad(/@aws-sdk\/smithy-client\/dist\/cjs\/client\.js/, instrumentGlobalSmithy);
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

function instrumentGlobalSmithy(Smithy) {
  shimmer.wrap(Smithy.Client.prototype, 'send', shimSmithySend);
}

function shimSmithySend(originalSend) {
  return function () {
    const self = this;
    const smithySendArgs = getFunctionArguments(arguments);
    const command = smithySendArgs[0];

    if (isActive) {
      const awsProduct = operationMap[command.constructor.name];

      if (awsProduct) {
        return awsProduct.instrumentedSmithySend(self, originalSend, smithySendArgs);
      }

      return originalSend.apply(self, smithySendArgs);
    }
    return originalSend.apply(self, smithySendArgs);
  };
}
