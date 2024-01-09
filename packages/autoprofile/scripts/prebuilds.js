/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * This is just a wrapper around the CLI commands `prebuildify` and `prebuildify-cross`.
 *
 * Instead of using this wrapper, you can manually run the commands:
 * npx prebuildify -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip --arch arm64
 * npx prebuildify-cross --modules ../../node_modules -i linux-arm64 -t node@14.0.0 --strip
 */

const abi = require('node-abi');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;

const semver = require('semver');
const childProcess = require('child_process');

const minNodeVersion = require('../package.json').engines.node;
const excludeTargets = ['15.0.0', '17.0.0', '19.0.0'];
let targets;

if (!argv.abi) {
  targets = abi.supportedTargets
    .filter(
      obj =>
        obj.runtime === 'node' && semver.satisfies(obj.target, minNodeVersion) && !excludeTargets.includes(obj.target)
    )
    .map(obj => obj.target)
    .join(' -t ');
} else {
  targets = argv.abi.split(',').join(' -t ');
}

// darwin
if (!argv.os || (argv.os && argv.os === 'darwin')) {
  let archs = ['arm64', 'x64'];

  if (argv.arch) {
    archs = argv.arch.split(',');
  }

  console.log(`\n### Building darwin prebuilds for ${targets} ${archs}...\n`);

  archs.forEach(arch => {
    childProcess.execSync(`npx prebuildify -t ${targets} --strip --arch ${arch}`, { stdio: 'inherit' });
  });
}

// linux
// alpine = x64 musl
// centos7-devtoolset7 = x64 glibc
if (!argv.os || (argv.os && argv.os === 'linux')) {
  let archs = ['alpine', 'linux-arm64', 'centos7-devtoolset7', 'linux-armv6', 'linux-armv7'];
  if (argv.arch) {
    archs = argv.arch.split(',');
  }

  console.log(`\n### Building linux prebuilds for ${targets} ${archs}...\n`);

  archs.forEach(image => {
    childProcess.execSync(`npx prebuildify-cross --modules ../../node_modules -i ${image} -t ${targets} --strip`, {
      stdio: 'inherit'
    });
  });
}
