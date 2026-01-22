/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const assert = require('assert');

module.exports = (name, version) => {
  const appFolder = process.cwd();
  const module = require(name, { paths: [appFolder] });
  assert(require.resolve(name, { paths: [appFolder] }).includes(path.join(appFolder, 'node_modules', name)));

  if (version) {
    const packageJson = require(path.join(appFolder, 'node_modules', name, 'package.json'));
    assert.strictEqual(packageJson.version, version);
  }

  return module;
};
