/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

class InstanaAWSProduct {
  /**
   * @param {string} spanName
   * @param {Array.<string>} operations
   */
  constructor(spanName, operations) {
    this.spanName = spanName;
    this.operations = operations;
  }

  instrumentedMakeRequest(/** ctx, originalMakeRequest, originalArgs */) {
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
        spanData.error = err.message || err.code || JSON.stringify(err);
      }
    }
  }
}

module.exports.InstanaAWSProduct = InstanaAWSProduct;
