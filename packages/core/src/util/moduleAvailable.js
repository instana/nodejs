/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

exports.isProcessAvailable = () => {
  return process && typeof process === 'object';
};
