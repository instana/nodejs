/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// npx prebuildify -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip --arch arm64
// eslint-disable-next-line max-len
// npx prebuildify-cross --modules ../../node_modules -i linux-arm64 -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip

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
  childProcess.execSync(`npx prebuildify -t ${targets} --strip --arch arm64`, { stdio: 'inherit' });
  childProcess.execSync(`npx prebuildify -t ${targets} --strip --arch x64`, { stdio: 'inherit' });
}

// linux
// alpine = x64 musl
// centos7-devtoolset7 = x64 glibc
if (!argv.os || (argv.os && argv.os === 'linux')) {
  ['alpine', 'linux-arm64', 'centos7-devtoolset7'].forEach(image => {
    childProcess.execSync(`npx prebuildify-cross --modules ../../node_modules -i ${image} -t ${targets} --strip`, {
      stdio: 'inherit'
    });
  });
}
