/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Converts boolean configs to disable patterns. True values become module names ('logging') and,
 * false values become negated modules names ('!logging'). This lets us disable entire categories while
 * keeping specific modules enabled - like disabling all logging except console by passing
 * {logging: true, console: false} which becomes ['logging', '!console'].
 *
 * @param {{ [s: string]: any; } | ArrayLike<any>} disableConfig
 */
exports.normalizeConfig = function normalizeConfig(disableConfig) {
  if (!disableConfig) {
    return [];
  }

  if (isObjectConfig(disableConfig)) {
    return convertObjectToPatterns(disableConfig);
  }

  if (Array.isArray(disableConfig)) {
    return [...disableConfig];
  }

  return [];
};

/**
 * @returns {config is Record<string, boolean>}
 * @param {{ [s: string]: any; } | ArrayLike<any>} config
 */
function isObjectConfig(config) {
  return config !== null && typeof config === 'object';
}

/**
 * Converts {module: boolean} to ['module'] or ['!module']
 * @param {Record<string, boolean>} configObject
 * @returns {string[]}
 */
function convertObjectToPatterns(configObject) {
  return Object.entries(configObject).flatMap(([moduleName, shouldDisable]) => {
    if (shouldDisable === true) return [moduleName];
    if (shouldDisable === false) return [`!${moduleName}`];
    return [];
  });
}
