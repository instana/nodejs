/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

require('dotenv').config();

export const config = {
  mode: getValue('MODE', 'local'),
  appPort: getInt('APP_PORT'),
  collectorEnabled: getBool('COLLECTOR_ENABLED', true),
  tracingEnabled: getBool('TRACING_ENABLED', true),
  logRequests: getBool('LOG_REQUESTS', false),
  agentPort: undefined
};

function getValue(key: string, fallback: any) {
  if (process.env[key] == null) {
    return fallback;
  }
  return process.env[key];
}

function getInt(key: string): number | null {
  if (process.env[key] == null) {
    return null;
  }
  const val = parseInt(process.env[key] as string, 10);
  if (isNaN(val)) {
    console.log(`Cannot parse ${key} value: ${process.env[key]}`);
    return null;
  }
  return val;
}

function getBool(key: string, fallback: boolean): boolean {
  if (process.env[key] == null) {
    return fallback;
  }
  return process.env[key] !== 'false';
}
