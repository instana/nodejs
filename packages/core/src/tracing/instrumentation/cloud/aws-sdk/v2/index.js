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

awsProducts.forEach(awsProduct => {
  Object.assign(operationMap, awsProduct.getOperations());
});

let isActive = false;

exports.instrumentationName = 'aws-sdk/v2';

exports.isActive = function () {
  return isActive;
};

exports.init = function init() {
  hook.onModuleLoad('aws-sdk', instrumentAWS);
};

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function instrumentAWS(AWS) {
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
