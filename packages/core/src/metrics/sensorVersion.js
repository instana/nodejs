'use strict';

const path = require('path');

exports.payloadPrefix = 'sensorVersion';
exports.currentPayload = require(path.join('..', '..', 'package.json')).version;
