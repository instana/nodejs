'use strict';

var fs = require('fs');
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

var pidInParentNamespace = getPidFromParentNamespace();
if (pidInParentNamespace) {
  exports.pid = pidInParentNamespace;
  logger.info(
    'Changing pid to %s due to successful identification of PID in parent namespace',
    pidInParentNamespace
  );
}


function getPidFromParentNamespace() {
  try {
    var schedFileContent = fs.readFileSync(
      '/proc/' + process.pid + '/sched',
      {encoding: 'utf8'}
    );

    var match = schedFileContent.match(/^node \((\d+)/i);
    if (!match) {
      logger.debug('Could not locate PID in sched file');
      return null;
    }

    var pidInSchedFile = parseInt(match[1], 10);
    if (pidInSchedFile === process.pid) {
      logger.debug('PID in sched file matches PID. Probably not running inside a PID namespace');
      return null;
    }

    return pidInSchedFile;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('PID could not be read from sched file. Reason: %s', err.message);
    }
  }
}
