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
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');

module.exports = exports = function buildSingleAddOn(abi, version) {
  const platform = os.platform();
  const arch = process.arch;

  let family = null;
  if (platform === 'linux') {
    family = require('detect-libc').family;
  }

  const addonDir = path.join(__dirname, '..', 'addons', platform, arch, family || '', abi);
  const addonPath = path.join(addonDir, 'autoprofile.node');
  const label = `${platform}/${arch}/${family ? `${family}/` : ''}${abi} (target=${version})`;

  console.log(`Building native addon for ${label} (${addonPath}).`);
  if (!existsSync(addonDir)) {
    mkdirp.sync(addonDir);
  }

  let darwinNodeJs10Fix = '';
  if (platform === 'darwin' && semver.gte(version, '10.0.0') && semver.lt(version, '12.0.0')) {
    darwinNodeJs10Fix = '--build_v8_with_gn=false';
  }

  let command = `node node_modules/node-gyp/bin/node-gyp.js rebuild --target=${version} ${darwinNodeJs10Fix} --arch=x64`;
  const cwd = path.join(__dirname, '..');

  // NOTE: the command is not only executed on the container, also on your local developer machine if you run `build-all-addons`
  if (cwd !== '/opt/autoprofile') {
    const rootGyp = path.join(__dirname, '..', '..', '..', 'node_modules');
    command = `node ${rootGyp}/node-gyp/bin/node-gyp.js rebuild --target=${version} ${darwinNodeJs10Fix} --arch=x64`;
  }

  console.log(`Running "${command}" in directory "${cwd}".`);
  execSync(command, {
    cwd,
    stdio: 'inherit'
  });
  copyFileSync('build/Release/autoprofile-addon.node', addonPath);
};
