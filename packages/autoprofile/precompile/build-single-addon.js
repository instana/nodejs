/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { execSync } = require('child_process');
const { copyFileSync, existsSync } = require('fs');
// eslint-disable-next-line import/no-extraneous-dependencies
const { mkdirp } = require('mkdirp');
const path = require('path');
const os = require('os');

module.exports = exports = function buildSingleAddOn(abi, version) {
  const platform = os.platform();
  const arch = process.arch === 'arm64' ? 'x64' : process.arch;

  let family = null;
  if (platform === 'linux') {
    family = require('detect-libc').familySync();
  }

  const addonDir = path.join(__dirname, '..', 'addons', platform, arch, family || '', abi);
  const addonPath = path.join(addonDir, 'autoprofile.node');
  const label = `${platform}/${arch}/${family ? `${family}/` : ''}${abi} (target=${version})`;

  console.log(`Building native addon for ${label} (${addonPath}).`);
  if (!existsSync(addonDir)) {
    mkdirp.sync(addonDir);
  }

  let command = `node node_modules/node-gyp/bin/node-gyp.js rebuild --target=${version} --arch=x64`;
  const cwd = path.join(__dirname, '..');

  // NOTE: for darwin, we execute the rebuild on the local developer machine
  if (cwd !== '/opt/autoprofile') {
    const rootGyp = path.join(__dirname, '..', '..', '..', 'node_modules');
    // NOTE: Node v14 failed because of: https://github.com/nodejs/node-gyp/issues/2673
    command = `node ${rootGyp}/node-gyp/bin/node-gyp.js rebuild --target=${version} --arch=x64`;
  }

  console.log(`Running "${command}" in directory "${cwd}".`);
  execSync(command, {
    cwd,
    stdio: 'inherit'
  });
  copyFileSync('build/Release/autoprofile-addon.node', addonPath);
};
