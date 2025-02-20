/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

exports.backendConnector = require('./backend_connector');
// TODO: rename in major release to simply "exports.logger"
exports.consoleLogger = require('./logger');
exports.constants = require('./constants');
exports.environment = require('./environment');
exports.headers = require('./headers');
