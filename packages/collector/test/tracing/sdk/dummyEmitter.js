/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const EventEmitter = require('events');
const util = require('util');

function DummyEmitter() {
  EventEmitter.call(this);
}
util.inherits(DummyEmitter, EventEmitter);

DummyEmitter.prototype.start = function start() {
  const that = this;
  this.intervalHandle = setInterval(() => {
    that.emit('tick');
  }, 100);
  this.intervalHandle.unref();
};

DummyEmitter.prototype.stop = function stop() {
  if (this.intervalHandle) {
    clearInterval(this.intervalHandle);
  }
};

module.exports = exports = DummyEmitter;
