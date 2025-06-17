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
 * @param {{ [s: string]: any; } | ArrayLike<any>} disablingConfig
 */
exports.normalizeConfig = function normalizeConfig(disablingConfig) {
  if (!disablingConfig) return [];

  if (disablingConfig !== null && typeof disablingConfig === 'object' && !Array.isArray(disablingConfig)) {
    return Object.entries(disablingConfig).flatMap(([key, value]) => {
      if (value === true) return [key];
      if (value === false) return [`!${key}`];
      return [];
    });
  }

  if (Array.isArray(disablingConfig)) {
    return [...disablingConfig];
  }

  return [];
};
