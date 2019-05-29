'use strict';

require('dotenv').config();

module.exports = exports = {
  appPort: getInt('APP_PORT'),
  collectorEnabled: getBool('COLLECTOR_ENABLED', true),
  tracingEnabled: getBool('TRACING_ENABLED', true),
  logRequests: getBool('LOG_REQUESTS', false)
};

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
