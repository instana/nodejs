/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const path = require('path');

exports.payloadPrefix = 'sensorVersion';
exports.currentPayload = require(path.join('..', '..', 'package.json')).version;
