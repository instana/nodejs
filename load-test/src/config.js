'use strict';

require('dotenv').config();

module.exports = exports = {
  app: {
    workers: getInt('APP_WORKERS'),
    httpPort: getInt('APP_PORT'),
    downstreamHttpPort: getInt('DOWNSTREAM_PORT')
  },
  sensor: {
    agentPort: getInt('AGENT_PORT'),
    enabled: getBool('SENSOR_ENABLED'),
    tracing: getBool('TRACING_ENABLED'),
    stackTraceLength: getInt('STACK_TRACE_LENGTH')
  }
};

function getInt(varName) {
  var val = parseInt(process.env[varName], 10);
  if (isNaN(val)) {
    return null;
  }
  return val;
}

function getBool(varName) {
  return process.env[varName] !== 'false';
}
