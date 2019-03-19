'use strict';

var EventEmitter = require('events');
var util = require('util');

function DummyEmitter() {
  EventEmitter.call(this);
}
util.inherits(DummyEmitter, EventEmitter);

DummyEmitter.prototype.start = function start() {
  var that = this;
  this.intervalHandle = setInterval(function() {
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
