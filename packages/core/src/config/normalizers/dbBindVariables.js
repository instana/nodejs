/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  DEFAULT_DB_BIND_VARIABLES_DISABLE,
  DEFAULT_DB_BIND_VARIABLES_ALLOWED_COLUMNS
} = require('../../util/constants');

/** @type {import('../../core').GenericLogger} */
let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * @typedef {Object} DbBindVariablesConfig
 * @property {boolean} disable
 * @property {string[]} allowedColumns
 */

/**
 * Resolves the global db-bind-variables configuration from environment variables.
 * ENV has the highest priority.
 *
 * @returns {DbBindVariablesConfig | null} resolved config or null if no env vars are set
 */
exports.fromEnv = function fromEnv() {
  const disableEnv = process.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
  const columnsEnv = process.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;

  if (disableEnv == null && columnsEnv == null) {
    return null;
  }

  /** @type {DbBindVariablesConfig} */
  const config = {
    disable: DEFAULT_DB_BIND_VARIABLES_DISABLE,
    allowedColumns: DEFAULT_DB_BIND_VARIABLES_ALLOWED_COLUMNS.slice()
  };

  if (disableEnv != null) {
    const normalized = disableEnv.toLowerCase();
    if (normalized === 'true') {
      config.disable = true;
    } else if (normalized === 'false') {
      config.disable = false;
    } else {
      logger?.warn(
        `Invalid value for INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE: "${disableEnv}". Expected true or false.`
      );
    }
  }

  if (columnsEnv != null) {
    config.allowedColumns = parseColumnList(columnsEnv);
  }

  return config;
};

/**
 * Normalizes the db-bind-variables block supplied via in-code configuration.
 *
 * Expected in-code shape (camelCase):
 * ```
 * { disable: boolean, allowedColumns: string[] }
 * ```
 *
 * @param {Record<string, any>} inCodeDbBindVars - the `tracing.dbBindVariables` object from user config
 * @returns {DbBindVariablesConfig | null} resolved config or null if the input is not a valid object
 */
exports.fromInCode = function fromInCode(inCodeDbBindVars) {
  if (!inCodeDbBindVars || typeof inCodeDbBindVars !== 'object') {
    return null;
  }

  /** @type {DbBindVariablesConfig} */
  const config = {
    disable: DEFAULT_DB_BIND_VARIABLES_DISABLE,
    allowedColumns: DEFAULT_DB_BIND_VARIABLES_ALLOWED_COLUMNS.slice()
  };
  let changed = false;

  const disable = inCodeDbBindVars.disable;
  if (typeof disable === 'boolean') {
    config.disable = disable;
    changed = true;
  } else if (disable != null) {
    logger?.warn(`Invalid value for tracing.dbBindVariables.disable: "${disable}". Expected a boolean.`);
  }

  const allowedColumns = inCodeDbBindVars.allowedColumns;
  if (Array.isArray(allowedColumns)) {
    config.allowedColumns = allowedColumns.filter(c => typeof c === 'string' && c.trim() !== '').map(c => c.trim());
    changed = true;
  } else if (allowedColumns != null) {
    logger?.warn(
      `Invalid value for tracing.dbBindVariables.allowedColumns: "${allowedColumns}". Expected an array of strings.`
    );
  }

  return changed ? config : null;
};

/**
 * Normalizes the db-bind-variables block received from the agent's global config.
 *
 * Expected agent shape:
 * ```
 * { 'disable': boolean, 'allowed-columns': string[] }
 * ```
 *
 * @param {Record<string, any>} agentGlobalDbBindVars - the `db-bind-variables` object from the agent's global block
 * @returns {DbBindVariablesConfig | null} resolved config or null if the input is invalid
 */
exports.fromAgent = function fromAgent(agentGlobalDbBindVars) {
  if (!agentGlobalDbBindVars || typeof agentGlobalDbBindVars !== 'object') {
    return null;
  }

  /** @type {DbBindVariablesConfig} */
  const config = {
    disable: DEFAULT_DB_BIND_VARIABLES_DISABLE,
    allowedColumns: DEFAULT_DB_BIND_VARIABLES_ALLOWED_COLUMNS.slice()
  };
  let changed = false;

  const disable = agentGlobalDbBindVars.disable;
  if (typeof disable === 'boolean') {
    config.disable = disable;
    changed = true;
  } else if (disable != null) {
    logger?.warn(`Invalid value for agent db-bind-variables.disable: "${disable}". Expected a boolean.`);
  }

  const allowedColumns = agentGlobalDbBindVars['allowed-columns'];
  if (Array.isArray(allowedColumns)) {
    config.allowedColumns = allowedColumns.filter(c => typeof c === 'string' && c.trim() !== '').map(c => c.trim());
    changed = true;
  } else if (allowedColumns != null) {
    logger?.warn(
      `Invalid value for agent db-bind-variables.allowed-columns: "${allowedColumns}". Expected an array of strings.`
    );
  }

  return changed ? config : null;
};

/**
 * Parses a comma-separated column list from an environment variable value.
 *
 * @param {string} value
 * @returns {string[]}
 */
function parseColumnList(value) {
  return value
    .split(',')
    .map(col => col.trim())
    .filter(col => col !== '');
}
