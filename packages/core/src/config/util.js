/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { CONFIG_SOURCES } = require('../util/constants');

const SOURCE_LABELS = {
  [CONFIG_SOURCES.ENV]: 'env',
  [CONFIG_SOURCES.INCODE]: 'incode',
  [CONFIG_SOURCES.AGENT]: 'agent',
  [CONFIG_SOURCES.DEFAULT]: 'default'
};

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

/**
 * @param {{ configPath: string, source: number, value: any, envVarName?: string }} params
 */
exports.log = function log({ configPath, source, value, envVarName }) {
  if (source === CONFIG_SOURCES.DEFAULT) {
    return;
  }

  if (source === CONFIG_SOURCES.ENV && envVarName) {
    logger?.debug(`[config] ${configPath} <- env:${envVarName} = ${JSON.stringify(value)}`);
    return;
  }

  logger?.debug(`[config] ${configPath} <- ${SOURCE_LABELS[source]}:${configPath} = ${JSON.stringify(value)}`);
};
