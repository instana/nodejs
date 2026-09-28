/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  DEFAULT_DB_BIND_VARIABLES_DISABLE,
  DEFAULT_DB_BIND_VARIABLES_ALLOWED_COLUMNS
} = require('../../util/constants');
const { allowedColumnsValidator, booleanValidator } = require('../validator');

/**
 * @typedef {Object} DbBindVariablesConfig
 * @property {boolean} disable
 * @property {string[]} allowedColumns
 */

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

  const disable = booleanValidator(agentGlobalDbBindVars.disable);
  if (disable !== undefined) {
    config.disable = disable;
  }

  const parsed = allowedColumnsValidator(agentGlobalDbBindVars['allowed-columns']);
  if (parsed !== undefined) {
    config.allowedColumns = parsed;
  }

  return config;
};
