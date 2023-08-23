/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('../../../../shimmer');
const requireHook = require('../../../../../util/requireHook');
const { getFunctionArguments } = require('../../../../../util/function_arguments');

/** @type {Array.<import('./instana_aws_product').InstanaAWSProduct}> */
const awsProducts = [
  //
  require('./dynamodb'),
  require('./s3'),
  require('./sqs'),
  require('./kinesis')
];

const sqsConsumer = require('./sqs-consumer');

/** @type {Object.<string, import('./instana_aws_product').InstanaAWSProduct} */
const operationMap = {};

awsProducts.forEach(awsProduct => {
  Object.assign(operationMap, awsProduct.getOperations());
});

let isActive = false;

exports.init = function init() {
  sqsConsumer.init();

  // NOTE: each aws product can have it's own init fn to wrap or unwrap specific functions
  awsProducts.forEach(awsProduct => awsProduct.init && awsProduct.init(requireHook, shimmer));

  /**
   * @aws-sdk/smithly-client >= 3.36.0 changed how the dist structure gets delivered
   * https://github.com/aws/aws-sdk-js-v3/blob/main/packages/smithy-client/CHANGELOG.md#3360-2021-10-08
   * @aws-sdk/smithly-client is a subdependency of any @aws-sdk/* package
   */
  requireHook.onFileLoad(/@aws-sdk\/smithy-client\/dist-cjs\/client\.js/, instrumentGlobalSmithy);

  /**
   * @aws-sdk/smithly-client < 3.36.0
   */
  requireHook.onFileLoad(/@aws-sdk\/smithy-client\/dist\/cjs\/client\.js/, instrumentGlobalSmithy);
  /**
   * @aws-sdk/smithly-client > 3.36.0
   */
  requireHook.onModuleLoad('@smithy/smithy-client', instrumentGlobalSmithy);
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
      const serviceId = self.config && self.config.serviceId;
      let awsProduct = serviceId && awsProducts.find(aws => aws.spanName === serviceId.toLowerCase());

      if (awsProduct && awsProduct.supportsOperation(command.constructor.name)) {
        return awsProduct.instrumentedSmithySend(self, originalSend, smithySendArgs);
      } else {
        // This code can be removed once all AWS SDK v3 instrumentations have been refactored to use the new approach
        // introduced in https://github.com/instana/nodejs/pull/838 for kinesis. That is: Do not use an explicit
        // operationsInfo/operationsMap map that restricts the traced operations to a subset of possible operations, but
        // instead allow _all_ operations to be traced, using the operation name from `command.constructor.name` for
        // span.data.$spanName.op. We plan to finish this refactoring before or with the next major release (3.x) of the
        // @instana packages.
        awsProduct = operationMap[smithySendArgs[0].constructor.name];
        if (awsProduct) {
          return awsProduct.instrumentedSmithySend(this, originalSend, smithySendArgs);
        }

        return originalSend.apply(this, smithySendArgs);
      }
    }
    return originalSend.apply(self, smithySendArgs);
  };
}
