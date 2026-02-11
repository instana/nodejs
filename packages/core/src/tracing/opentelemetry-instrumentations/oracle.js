/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const constants = require('../constants');

module.exports.init = () => {
  const { OracleInstrumentation } = require('@opentelemetry/instrumentation-oracledb');

  const instrumentation = new OracleInstrumentation({
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
    }
  });

  if (!instrumentation.getConfig().enabled) {
    instrumentation.enable();
  }
};

module.exports.getKind = () => {
  const kind = constants.EXIT;
  return kind;
};
