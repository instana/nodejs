/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  DEFAULT_DB_BIND_VARIABLES_DISABLE,
  DEFAULT_DB_BIND_VARIABLES_ALLOWED_COLUMNS
} = require('../../util/constants');

/**
 * @typedef {Object} DbBindVariablesConfig
 * @property {boolean} disable
 * @property {string[]} allowedColumns
 */

/**
 * Resolves the db-bind-variables configuration from environment variables.
 * Returns null when neither env var is set.
 *
 * @returns {DbBindVariablesConfig | null}
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
    if (normalized === 'true') config.disable = true;
    else if (normalized === 'false') config.disable = false;
    // invalid value: leave default, caller is responsible for warning
  }

  if (columnsEnv != null) {
    config.allowedColumns = parseColumnList(columnsEnv);
  }

  return config;
};

/**
 * Normalizes the db-bind-variables block from in-code configuration.
 * Returns null when the input is not a non-null object.
 *
 * Expected shape: `{ disable: boolean, allowedColumns: string[] }`
 *
 * @param {Record<string, any>} inCodeDbBindVars
 * @returns {DbBindVariablesConfig | null}
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

  if (typeof inCodeDbBindVars.disable === 'boolean') {
    config.disable = inCodeDbBindVars.disable;
  }

  if (Array.isArray(inCodeDbBindVars.allowedColumns)) {
    config.allowedColumns = inCodeDbBindVars.allowedColumns
      .filter(c => typeof c === 'string' && c.trim() !== '')
      .map(c => c.trim());
  }

  return config;
};

/**
 * Normalizes the db-bind-variables block from the agent's global config.
 * Returns null when the input is not a non-null object.
 *
 * Expected shape: `{ disable: boolean, 'allowed-columns': string[] }`
 *
 * @param {Record<string, any>} agentGlobalDbBindVars
 * @returns {DbBindVariablesConfig | null}
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

  if (typeof agentGlobalDbBindVars.disable === 'boolean') {
    config.disable = agentGlobalDbBindVars.disable;
  }

  const allowedColumns = agentGlobalDbBindVars['allowed-columns'];
  if (Array.isArray(allowedColumns)) {
    config.allowedColumns = allowedColumns
      .filter(c => typeof c === 'string' && c.trim() !== '')
      .map(c => c.trim());
  }

  return config;
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
