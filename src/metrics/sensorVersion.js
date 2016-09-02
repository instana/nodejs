'use strict';

var path = require('path');

exports.payloadPrefix = 'sensorVersion';
exports.currentPayload = require(path.join('..', '..', 'package.json')).version;

exports.activate = function() {};
exports.deactivate = function() {};
