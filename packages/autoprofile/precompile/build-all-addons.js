#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const os = require('os');
const path = require('path');
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { GLIBC, MUSL } = require('detect-libc');

const buildSingleAddOn = require('./build-single-addon');
const prepareDockerImages = require('./prepare-docker-images');
const buildOnDocker = require('./build-on-docker');

// Make packages/autoprofile the current working dir.
process.chdir(path.join(__dirname, '..'));

const PLATFORMS = ['linux'];

if (os.platform() === 'darwin') {
  // Only build for MacOS if running on MacOS.
  console.log('Build is running on MacOS, will build darwin binaries, too.');
  PLATFORMS.push('darwin');
} else {
  console.log('Build is not running on MacOS, will not build darwin binaries.');
}

const LIBC_FAMILIES = [GLIBC, MUSL];

// Maintenance Note:
// This should be kept in sync with native-dep-packs/rebuild-precompiled-addons.sh -> ABI_VERSIONS.
const ABI_VERSIONS = {
  64: '10.24.1',
  72: '12.22.1',
  83: '14.17.0',
  88: '15.14.0',
  93: '16.3.0',
  108: '18.0.0'
};

function buildForPlatform(platform) {
  if (platform === 'linux') {
    prepareDockerImages(LIBC_FAMILIES);
    LIBC_FAMILIES.forEach(family => {
      buildForAllAbis(platform, family);
    });
  } else {
    buildForAllAbis(platform, null);
  }
}

function buildForAllAbis(platform, family) {
  Object.entries(ABI_VERSIONS).forEach(([abi, version]) => {
    buildOnHostOrDocker(platform, family, abi, version);
  });
}

function buildOnHostOrDocker(platform, family, abi, version) {
  if (platform === 'darwin') {
    buildSingleAddOn(abi, version);
  } else if (platform === 'linux') {
    buildOnDocker(platform, family, abi, version);
  } else {
    console.error(`Platform not supported: ${platorm}`);
    process.exit(1);
  }
}

PLATFORMS.forEach(buildForPlatform);
