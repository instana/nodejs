/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

module.exports = class FakeRequestHandler {
  constructor({ when, then, onlyOnce = false }) {
    this.when = when;
    this.then = then;
    this.onlyOnce = onlyOnce;
    this.called = false;
  }

  matches(host, port) {
    if (this.onlyOnce && this.called) {
      return false;
    }
    return host === this.when.host && port === this.when.port;
  }

  call(emitter, callback) {
    this.called = true;
    setImmediate(() => {
      this.then(emitter, callback);
    });
  }

  hasBeenCalled() {
    return this.called;
  }

  reset() {
    this.called = false;
  }

  clone() {
    return new FakeRequestHandler({ when: this.when, then: this.then, onlyOnce: this.onlyOnce });
  }
};
