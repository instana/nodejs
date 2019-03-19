'use strict';

var callback = require('./sdk')(true);
var promise = require('./sdk')(false);

exports.init = function init(config) {
  callback.init(config);
  promise.init(config);
};

exports.activate = function activate() {
  callback.activate();
  promise.activate();
};

exports.deactivate = function deactivate() {
  callback.deactivate();
  promise.deactivate();
};

exports.callback = callback;
exports.promise = promise;
