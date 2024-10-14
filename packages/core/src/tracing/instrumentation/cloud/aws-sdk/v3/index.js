/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('../../../../shimmer');
const hook = require('../../../../../util/hook');
const { getFunctionArguments } = require('../../../../../util/function_arguments');

/** @type {Array.<import('./instana_aws_product').InstanaAWSProduct}> */
const awsProducts = [
  //
  require('./dynamodb'),
  require('./s3'),
  require('./sqs'),
  require('./kinesis'),
  require('./sns'),
  require('./lambda')
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
  awsProducts.forEach(awsProduct => awsProduct.init && awsProduct.init(hook, shimmer));

  /**
   * @aws-sdk/smithly-client >= 3.36.0 changed how the dist structure gets delivered
   * https://github.com/aws/aws-sdk-js-v3/blob/main/packages/smithy-client/CHANGELOG.md#3360-2021-10-08
   * @aws-sdk/smithly-client is a subdependency of any @aws-sdk/* package
   */
  hook.onFileLoad(/@aws-sdk\/smithy-client\/dist-cjs\/client\.js/, instrumentGlobalSmithy);

  /**
   * @aws-sdk/smithly-client < 3.36.0
   */
  hook.onFileLoad(/@aws-sdk\/smithy-client\/dist\/cjs\/client\.js/, instrumentGlobalSmithy);
  /**
   * @aws-sdk/smithly-client > 3.36.0
   */
  hook.onModuleLoad('@smithy/smithy-client', instrumentGlobalSmithy);
};

exports.isActive = function () {
  return isActive;
};

// NOTE: you currently can only disable the whole AWS SDK v3
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

    const serviceId = self.config && self.config.serviceId;
    let awsProduct = serviceId && awsProducts.find(aws => aws.getServiceIdName() === serviceId.toLowerCase());
    if (awsProduct && awsProduct.supportsOperation(command.constructor.name)) {
      return awsProduct.instrumentedSmithySend(self, isActive, originalSend, smithySendArgs);
    } else {
      // This logic should not be used in AWS SDK v4. All AWS SDK v4 instrumentations must use the new approach
      // introduced in https://github.com/instana/nodejs/pull/838 for Kinesis. That is: Do not use an explicit
      // operationsInfo/operationsMap that restricts the traced operations to a subset of possible operations.
      // Instead, allow all operations to be traced using the operation name from `command.constructor.name`
      // for span.data.$spanName.op.
      awsProduct = operationMap[smithySendArgs[0].constructor.name];
      if (awsProduct) {
        return awsProduct.instrumentedSmithySend(self, isActive, originalSend, smithySendArgs);
      }

      return originalSend.apply(self, smithySendArgs);
    }
  };
}
