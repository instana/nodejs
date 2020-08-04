'use strict';

var semver = require('semver');

module.exports = exports = function supportedVersion(version) {
  return semver.satisfies(version, '^6 || ^7 || ^8.2.1 || ^9.1.0 || ^10.4.0 || ^11 || >=12.0.0');
};
