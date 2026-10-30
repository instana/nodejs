/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const SEVERITY_NUMBERS = new Map([
  ['trace', 1],
  ['debug', 5],
  ['info', 9],
  ['warn', 13],
  ['error', 17],
  ['fatal', 21]
]);

// According to OTEL spec, SeverityNumber=0 is used to represent an unspecified value.
const SEVERITY_NUMBER_UNKNOWN = 0;

module.exports = {
  SEVERITY_NUMBERS,
  SEVERITY_NUMBER_UNKNOWN
};
