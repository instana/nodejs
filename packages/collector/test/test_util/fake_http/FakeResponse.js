/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

module.exports = class FakeResponse {
  constructor(statusCode) {
    this.statusCode = statusCode;
  }

  resume() {}
};
