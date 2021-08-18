/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const EventEmitter = require('events');
const assert = require('assert');

class CountDownLatch extends EventEmitter {
  constructor(counter = 1) {
    super();
    assert(counter >= 0);
    this.counter = counter;
    this.doneEmitted = false;
  }

  countUp(increment = 1) {
    this.counter += increment;
  }

  countDown(decrement = 1) {
    if (this.counter >= decrement) {
      this.counter -= decrement;
      if (this.counter === 0 && !this.doneEmitted) {
        this.emit('done');
        this.doneEmitted = true;
      }
    }
  }
}

module.exports = CountDownLatch;
