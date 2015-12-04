'use strict';

var path = require('path');

exports.payloadType = 'both';
exports.payloadPrefix = 'sensorVersion';
exports.currentPayload = require(path.join('..', '..', 'package.json')).version;

exports.activate = function() {};
exports.deactivate = function() {};
