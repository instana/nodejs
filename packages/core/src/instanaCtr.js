/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * @typedef {object} InstanaCtrType
 * @property {function} utils
 * @property {function} config
 * @property {function} logger
 */

class InstanaCtr {
  /** @type {import('./util/index').CoreUtilsType} */
  utils_i;

  /** @type {import('./config/normalizeConfig').InstanaConfig} */
  config_i;

  /** @type {import('./core').GenericLogger} */
  logger_i;

  /**
   * @param {string} name
   * @param {*} instance
   */
  set(name, instance) {
    Object.defineProperty(this, `${name}_i`, {
      configurable: true,
      enumerable: true,
      writable: false,
      value: instance
    });
  }

  /**
   * @returns {import('./util/index').CoreUtilsType}
   */
  utils() {
    return this.utils_i;
  }

  /**
   * @returns {import('./config/normalizeConfig').InstanaConfig}
   */
  config() {
    return this.config_i;
  }

  /**
   * @returns {import('./core').GenericLogger}
   */
  logger() {
    return this.logger_i;
  }
}

exports.InstanaCtr = InstanaCtr;
