/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const { OracleInstrumentation } = require('@opentelemetry/instrumentation-oracledb');

  const instrumentation = new OracleInstrumentation({
    // Hook to capture bind variables before query execution
    requestHook: (span, request) => {
      // The query and bind variables are in inputArgs array
      // inputArgs[0] = SQL query string
      // inputArgs[1] = bind variables (array or object)
      // inputArgs[2] = options (optional)
      if (request.inputArgs && request.inputArgs.length > 0) {
        // First argument is always the SQL query
        const sqlQuery = request.inputArgs[0];
        if (sqlQuery && typeof sqlQuery === 'string') {
          span.setAttribute('db.statement', sqlQuery);
        }

        console.log('-----------------------------', span);

        // Second argument contains bind variables (if present)
        if (request.inputArgs.length > 1 && request.inputArgs[1]) {
          const bindVars = request.inputArgs[1];

          // Check if it's an array or object (not options object)
          // Options object typically has properties like autoCommit, fetchArraySize, etc.
          if (Array.isArray(bindVars) || (typeof bindVars === 'object' && !bindVars.autoCommit)) {
            span.setAttribute('db.bind_variables', JSON.stringify(bindVars));
          }
        }
      }
    },

    // Hook to capture additional response data
    responseHook: (span, response) => {
      if (response?.rowsAffected !== undefined) {
        span.setAttribute('db.rows_affected', response.rowsAffected);
      }
    }
  });

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => {
  return constants.EXIT;
};

/**
 * Transform OTel attributes to Instana format
 * This hook is called by wrap.js to modify span tags before creating Instana span
 */
module.exports.changeTags = (otelSpan, tags) => {
  console.log('==================', tags['db.statement']);
  // Format bind variables for better readability in Instana UI
  if (tags['db.bind_variables']) {
    try {
      const bindVars = JSON.parse(tags['db.bind_variables']);

      // Create a formatted string for display
      if (Array.isArray(bindVars)) {
        tags['db.bind_variables_formatted'] = bindVars.map((v, i) => `$${i + 1}=${formatValue(v)}`).join(', ');
      } else if (typeof bindVars === 'object') {
        tags['db.bind_variables_formatted'] = Object.entries(bindVars)
          .map(([k, v]) => `${k}=${formatValue(v)}`)
          .join(', ');
      }

      // Optionally inject bind variables into SQL statement for display
      if (tags['db.statement']) {
        tags['db.statement_with_values'] = injectBindVariables(tags['db.statement'], bindVars);
      }
    } catch (e) {
      // Keep original if parsing fails
    }
  }

  return tags;
};

/**
 * Format a value for display in bind variables
 */
function formatValue(value) {
  if (value === null) return 'NULL';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `'${value}'`;
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Inject bind variables into SQL statement for display purposes
 */
function injectBindVariables(sql, bindVars) {
  if (!sql || !bindVars) return sql;

  let result = sql;

  if (Array.isArray(bindVars)) {
    // Replace positional parameters (:1, :2, etc.)
    bindVars.forEach((value, index) => {
      const placeholder = `:${index + 1}`;
      const displayValue = formatValue(value);
      result = result.replace(new RegExp(placeholder, 'g'), displayValue);
    });
  } else if (typeof bindVars === 'object') {
    // Replace named parameters (:name, :id, etc.)
    Object.entries(bindVars).forEach(([key, value]) => {
      const placeholder = `:${key}`;
      const displayValue = formatValue(value);
      result = result.replace(new RegExp(placeholder, 'g'), displayValue);
    });
  }

  return result;
}
