/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

class InstanaAWSProduct {
  /**
   * @param {string} spanName
   * @param {Array.<string>} operations
   * @param {string} serviceName
   */
  constructor(spanName, operations, serviceName) {
    this.spanName = spanName;
    this.operations = operations || [];
    this.serviceName = serviceName || '';
  }

  instrumentedSmithySend(/** ctx, originalSend, smithySendArgs */) {
    throw new Error('Not implemented');
  }

  /**
   * @returns {Object.<string, InstanaAWSProduct>}
   */
  getOperations() {
    const operationMap = {};
    this.operations.forEach(op => {
      operationMap[op] = this;
    });
    return operationMap;
  }

  buildSpanData() {
    throw new Error('Not Implemented');
  }

  finishSpan(err, span) {
    if (err) {
      this.addErrorToSpan(err, span);
    }

    span.d = Date.now() - span.ts;
    span.transmit();
  }

  addErrorToSpan(err, span) {
    if (err) {
      span.ec = 1;
      const spanData = span.data && span.data[this.spanName];
      if (spanData) {
        span.data[this.spanName].error = err.message || err.code || JSON.stringify(err);
      }
    }
  }

  convertOperationName(operation) {
    const convertedOperation = operation.replace(/Command$/, '');
    return convertedOperation.charAt(0).toLowerCase() + convertedOperation.slice(1);
  }

  supportsOperation(operation) {
    if (!this.operations || !this.operations.length) return true;
    return this.operations.includes(operation);
  }

  getServiceIdName() {
    return this.serviceName || this.spanName;
  }
}

module.exports.InstanaAWSProduct = InstanaAWSProduct;
