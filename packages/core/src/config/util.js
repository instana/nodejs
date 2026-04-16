/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { CONFIG_SOURCES } = require('../util/constants');

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * @param {import('../core').GenericLogger} [_logger]
 */
exports.init = _logger => {
  logger = _logger;
};

const CONFIG_PRIORITY = Object.entries(CONFIG_SOURCES)
  .sort((a, b) => a[1] - b[1])
  .map(([key]) => {
    return key.toLowerCase();
  });

/**
 *
 * @param {Object} params
 * @param {string} [params.envVar]
 * @param {any} [params.configValue]
 * @param {any} [params.agentValue]
 * @param {any} params.defaultValue
 * @param {string} [params.configPath]
 * @param {Function|Function[]} validators - validator(s) returning value | undefined
 * @returns {{ value: any, source: number, configPath?: string }}
 */
exports.resolve = function resolve({ envVar, configValue, agentValue, defaultValue, configPath }, validators) {
  let resolved;

  const validatorList = Array.isArray(validators) ? validators : [validators];

  const inputs = {
    env: envVar ? process.env[envVar] : undefined,
    in_code: configValue,
    agent: agentValue,
    default: defaultValue
  };

  CONFIG_PRIORITY.find(sourceKey => {
    const rawValue = inputs[sourceKey];

    if (rawValue === undefined && sourceKey !== 'default') {
      return false;
    }

    const parsedValue = validatorList.reduce((val, fn) => {
      if (val === undefined) return undefined;
      return fn(val);
    }, rawValue);

    if (parsedValue !== undefined) {
      resolved = {
        value: parsedValue,
        source: CONFIG_SOURCES[sourceKey.toUpperCase()],
        configPath
      };

      logger?.debug(`[config] Resolved from ${sourceKey}: ${JSON.stringify(parsedValue)}`);
      return true;
    }

    if (rawValue !== undefined) {
      logger?.warn(`[config] Validation failed for ${sourceKey}: ${JSON.stringify(rawValue)}`);
    }

    return false;
  });

  return (
    resolved || {
      value: defaultValue,
      source: CONFIG_SOURCES.DEFAULT,
      configPath
    }
  );
};
