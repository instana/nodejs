/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const EventEmitter = require('events');

module.exports = class FakeRequest extends EventEmitter {
  constructor(handlers, opt, cb) {
    super();
    this.handlers = handlers;
    this.opt = opt;
    this.cb = cb;
  }

  setTimeout() {}

  end() {
    let matchingHandlerFound = false;
    for (let handlerIndex = 0; handlerIndex < this.handlers.length; handlerIndex++) {
      const handler = this.handlers[handlerIndex];
      if (handler.matches(this.opt.host, this.opt.port)) {
        matchingHandlerFound = true;
        handler.call(this, this.cb);
        break;
      }
    }

    if (!matchingHandlerFound) {
      throw Error(`No configured behavior in FakeRequest for ${this.opt.host}:${this.opt.port}.`);
    }
  }

  reset() {
    this.handlers.forEach(handler => {
      handler.reset();
    });
  }
};
