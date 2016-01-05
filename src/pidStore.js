'use strict';

var EventEmitter = require('events').EventEmitter;

var logger = require('./logger').getLogger('pidStore');


var eventName = 'pidChanged';
var eventEmitter = new EventEmitter();
exports.onPidChange = eventEmitter.on.bind(eventEmitter, eventName);


var pid = process.pid;
logger.info('Starting with pid %s', pid);
Object.defineProperty(exports, 'pid', {
  get: function() {
    return pid;
  },
  set: function(newPid) {
    if (pid !== newPid) {
      logger.info('Changing pid to %s', newPid);
      pid = newPid;
      eventEmitter.emit(eventName, pid);
    }
  }
});
