/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

module.exports = exports = function asyncRoute(fn) {
  // eslint-disable-next-line no-console
  return (req, res, next = console.error) => Promise.resolve(fn(req, res)).catch(next);
};
