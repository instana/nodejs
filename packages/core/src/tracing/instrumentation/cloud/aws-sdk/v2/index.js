/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('../../../../shimmer');
const hook = require('../../../../../util/hook');

/** @type {Array.<import('./instana_aws_product').InstanaAWSProduct}> */
const awsProducts = [
  //
  require('./lambda'),
  require('./dynamodb'),
  require('./kinesis'),
  require('./s3'),
  require('./sns')
];

/** @type {Object.<string, import('./instana_aws_product').InstanaAWSProduct} */
const operationMap = {};
let isActive = false;
let logger;

exports.isActive = function () {
  return isActive;
};

exports.init = function init(config) {
  logger = config.logger;

  awsProducts.forEach(AwsProductClass => {
    const awsProduct = new AwsProductClass(config);
    Object.assign(operationMap, awsProduct.getOperations());
  });

  hook.onModuleLoad('aws-sdk', instrumentAWS);
};

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function logDeprecationWarning() {
  logger.warn(
    // eslint-disable-next-line max-len
    '[Deprecation Warning] The support for AWS SDK v2 (aws-sdk) is deprecated and will be removed in the next major release. ' +
      'Please migrate to AWS SDK v3 (@aws-sdk/*). For more information, see: ' +
      'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrating.html'
  );
}

function instrumentAWS(AWS) {
  logDeprecationWarning();
  shimmer.wrap(AWS.Service.prototype, 'makeRequest', shimMakeRequest);
}

function shimMakeRequest(originalMakeRequest) {
  return function () {
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < originalArgs.length; i++) {
      originalArgs[i] = arguments[i];
    }

    const awsProduct = operationMap[originalArgs[0]];

    // to match operation + reference (S3, Dynamo, etc)
    if (awsProduct) {
      return awsProduct.instrumentedMakeRequest(this, isActive, originalMakeRequest, originalArgs);
    }
    return originalMakeRequest.apply(this, originalArgs);
  };
}
