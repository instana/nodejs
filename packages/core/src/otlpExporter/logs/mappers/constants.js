/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { LOG_LEVEL } = require('../../../util/constants');

const SEVERITY_NUMBERS = new Map([
  [LOG_LEVEL.TRACE, 1],
  [LOG_LEVEL.DEBUG, 5],
  [LOG_LEVEL.INFO, 9],
  [LOG_LEVEL.WARN, 13],
  [LOG_LEVEL.ERROR, 17],
  [LOG_LEVEL.FATAL, 21]
]);

// According to OTEL spec, SeverityNumber=0 is used to represent an unspecified value.
const SEVERITY_NUMBER_UNKNOWN = 0;

module.exports = {
  SEVERITY_NUMBERS,
  SEVERITY_NUMBER_UNKNOWN
};
