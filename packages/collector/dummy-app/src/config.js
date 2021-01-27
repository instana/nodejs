/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

require('dotenv').config();

module.exports = exports = {
  mode: getValue('MODE', 'local'),
  appPort: getInt('APP_PORT'),
  collectorEnabled: getBool('COLLECTOR_ENABLED', true),
  tracingEnabled: getBool('TRACING_ENABLED', true),
  logRequests: getBool('LOG_REQUESTS', false)
};

function getValue(key, fallback) {
  if (process.env[key] == null) {
    return fallback;
  }
  return process.env[key];
}

function getInt(key) {
  if (process.env[key] == null) {
    return null;
  }
  const val = parseInt(process.env[key], 10);
  if (isNaN(val)) {
    console.log(`Cannot parse ${key} value: ${process.env[key]}`);
    return null;
  }
  return val;
}

function getBool(key, fallback) {
  if (process.env[key] == null) {
    return fallback;
  }
  return process.env[key] !== 'false';
}
