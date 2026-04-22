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
 * @param {string} [params.envValue]
 * @param {any} [params.inCodeValue]
 * @param {any} [params.agentValue]
 * @param {any} params.defaultValue
 * @param {Function|Function[]} validators - validator(s) returning value | undefined
 * @returns {{ value: any, source: number }}
 */
exports.resolve = function resolve({ envValue, inCodeValue, agentValue, defaultValue }, validators) {
  let resolved;

  const validatorList = Array.isArray(validators) ? validators : [validators];

  const inputs = {
    env: envValue ? process.env[envValue] : undefined,
    incode: inCodeValue,
    agent: agentValue,
    default: defaultValue
  };

  CONFIG_PRIORITY.some(sourceKey => {
    const rawValue = inputs[/** @type {keyof typeof inputs} */ (sourceKey)];

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
        source: CONFIG_SOURCES[/** @type {keyof typeof CONFIG_SOURCES} */ (sourceKey.toUpperCase())]
      };

      logger?.debug(`[config] Resolved from ${sourceKey}: ${JSON.stringify(parsedValue)}`);
      return true;
    }

    return false;
  });

  return (
    resolved || {
      value: defaultValue,
      source: CONFIG_SOURCES.DEFAULT
    }
  );
};
