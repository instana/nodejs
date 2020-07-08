'use strict';

module.exports = exports = function asyncRoute(fn) {
  // eslint-disable-next-line no-console
  return (req, res, next = console.error) => Promise.resolve(fn(req, res)).catch(next);
};
