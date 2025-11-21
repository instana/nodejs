/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Helper function that throws an error when a 500 status is received.
 * This is used to test error stack replacement in HTTP client instrumentation.
 */
function handleErrorResponse(statusCode, responseBody) {
  if (statusCode >= 500) {
    const error = new Error(`Server error: ${statusCode}`);
    error.statusCode = statusCode;
    error.responseBody = responseBody;
    throw error;
  }
  return { statusCode, responseBody };
}

module.exports = {
  handleErrorResponse
};
