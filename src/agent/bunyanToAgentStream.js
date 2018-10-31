'use strict';

var log = require('./log');

var pidStore = require('../pidStore/internalPidStore');

module.exports = exports = {
  write: function write(record) {
    var logLevel = getAgentLogLevel(record.level);
    var message = 'Node.js sensor (pid: ' + process.pid + ', reporting pid: ' + pidStore.pid + '): ' + record.msg;
    var stack = null;

    if (record.err) {
      message += ': ' + record.err.message;
      stack = record.err.stack;
    }

    log(logLevel, message, stack);
  }
};

function getAgentLogLevel(level) {
  if (level < 30) {
    return 'debug';
  } else if (level < 40) {
    return 'info';
  } else if (level < 50) {
    return 'warning';
  }

  return 'error';
}
