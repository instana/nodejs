'use strict';

const { execSync } = require('child_process');
const { copyFileSync, existsSync } = require('fs');
const { sync: mkdirpSync } = require('mkdirp');
const path = require('path');
const os = require('os');

module.exports = exports = function buildSingleAddOn(abi, version) {
  const platform = os.platform();
  const arch = process.arch;

  let family = null;
  if (platform === 'linux') {
    family = require('detect-libc').family;
  }

  const addonDir = path.join(__dirname, '..', 'addons', platform, arch, family ? family : '', abi);
  const addonPath = path.join(addonDir, 'autoprofile.node');
  const label = `${platform}/${arch}/${family ? `${family}/` : ''}${abi} (target=${version})`;

  console.log(`Building native addon for ${label} (${addonPath}).`);
  if (!existsSync(addonDir)) {
    mkdirpSync(addonDir);
  }

  execSync(`node node_modules/node-gyp/bin/node-gyp.js rebuild --target=${version} --arch=x64`, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  copyFileSync('build/Release/autoprofile-addon.node', addonPath);
};
