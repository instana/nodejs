'use strict';

var debug = require('debug')('instana-nodejs-sensor:pidStore');
var EventEmitter = require('events').EventEmitter;


var eventName = 'pidChanged';
var eventEmitter = new EventEmitter();
exports.onPidChange = eventEmitter.on.bind(eventEmitter, eventName);


var pid = process.pid;
debug('Starting with pid ' + pid);
Object.defineProperty(exports, 'pid', {
  get: function() {
    return pid;
  },
  set: function(newPid) {
    if (pid !== newPid) {
      debug('Changing pid to ' + newPid);
      pid = newPid;
      eventEmitter.emit(eventName, pid);
    }
  }
});
