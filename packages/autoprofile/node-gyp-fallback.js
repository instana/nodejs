/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

const platform = os.platform();
const arch = process.arch;
const abi = process.versions.modules;

let family = null;
if (platform === 'linux') {
  const detectLibc = require('detect-libc');
  family = detectLibc.family;
  if (!family) {
    family = detectLibc.GLIBC;
  }
}

let addonPath;
if (family) {
  addonPath = path.join(__dirname, 'addons', platform, arch, family, abi, 'autoprofile.node');
} else {
  addonPath = path.join(__dirname, 'addons', platform, arch, abi, 'autoprofile.node');
}

if (fs.existsSync(addonPath)) {
  console.log(`Pre-built version of AutoProfile addon found at ${addonPath}, not building.`);
  return;
} else {
  console.log('Pre-built version of AutoProfile addon is not available, falling back to node-gyp.');
}

const gyp = child_process.spawn('node-gyp', ['rebuild'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });

gyp.on('error', err => {
  console.error('node-gyp not found.');
  process.exit(1);
});

gyp.on('close', code => {
  process.exit(code);
});
