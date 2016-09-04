'use strict';

var EventEmitter = require('events').EventEmitter;
var Module = require('module');

var listeners = new EventEmitter();

var origLoad;

exports.init = function() {
  origLoad = Module._load;
  Module._load = function(file) {
    var moduleExports = origLoad.apply(Module, arguments);
    listeners.emit(file, moduleExports);
    return moduleExports;
  };
};

exports.teardown = function() {
  Module._load = origLoad || Module._load;
};

exports.on = function on(moduleName, fn) {
  listeners.once(moduleName, fn);
};
