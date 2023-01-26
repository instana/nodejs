/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');
const cls = require('../../../../cls');
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
let onFileLoaded = false;

exports.init = function init() {
  requireHook.onModuleLoad('sqs-consumer', instrumentSQSConsumer);
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

function instrumentSQSConsumer(SQSConsumer) {
  shimmer.wrap(SQSConsumer.Consumer.prototype, 'executeHandler', function (orig) {
    return function instanaExecuteHandler() {
      const message = arguments[0];

      if (message && message.instanaAsyncContext) {
        return cls.runInAsyncContext(message.instanaAsyncContext, () => {
          const span = cls.getCurrentSpan();
          span.disableAutoEnd();

          delete arguments[0].instanaAsyncContext;
          const res = orig.apply(this, arguments);

          res
            .then(() => {
              span.d = Date.now() - span.ts;
              span.transmitManual();
            })
            .catch(err => {
              span.ec = 1;
              span.data.sqs.error = err.message || err.code || JSON.stringify(err);
              span.d = Date.now() - span.ts;
              span.transmitManual();
            });

          return res;
        });
      }

      return orig.apply(this, arguments);
    };
  });
}

function instrumentGlobalSmithy(Smithy) {
  // NOTE: avoid instrumenting aws-sdk v3 twice, see init
  if (onFileLoaded) {
    return;
  }

  onFileLoaded = true;
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
