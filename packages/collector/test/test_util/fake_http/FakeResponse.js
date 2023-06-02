/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const EventEmitter = require('events');

module.exports = class FakeResponse extends EventEmitter {
  constructor(statusCode, payload) {
    super();
    this.statusCode = statusCode;
    if (payload) {
      this.payload = Buffer.from(JSON.stringify(payload), 'utf8');
    }
  }

  emitPayload() {
    if (this.payload) {
      this.emit('data', this.payload);
    }
    this.emit('end');
  }

  setEncoding() {}

  resume() {}
};
