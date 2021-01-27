#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const os = require('os');
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { GLIBC, MUSL } = require('detect-libc');

const buildSingleAddOn = require('./build-single-addon');
const prepareDockerImages = require('./prepare-docker-images');
const buildOnDocker = require('./build-on-docker');

const PLATFORMS = ['linux'];

if (os.platform() === 'darwin') {
  // Only build for MacOS if running on MacOS.
  console.log('Build is running on MacOS, will build darwin binaries, too.');
  PLATFORMS.push('darwin');
} else {
  console.log('Build is not running on MacOS, will not build darwin binaries.');
}

const LIBC_FAMILIES = [GLIBC, MUSL];

const ABI_VERSIONS = {
  48: '6.17.1',
  57: '8.17.0',
  64: '10.23.0',
  72: '12.20.0',
  83: '14.15.1',
  88: '15.3.0'
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
    if (abi < 57) {
      // Do not compile older versions for MacOS.
      return;
    }
    buildSingleAddOn(abi, version);
  } else if (platform === 'linux') {
    buildOnDocker(platform, family, abi, version);
  } else {
    console.error(`Platform not supported: ${platorm}`);
    process.exit(1);
  }
}

PLATFORMS.forEach(buildForPlatform);
