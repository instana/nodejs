/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const path = require('path');
const { GLIBC, MUSL } = require('detect-libc');

const nodeJsVersion = '14.15.1';

module.exports = exports = function getDockerOpts(family) {
  let baseImage;
  let distro;
  if (family === GLIBC) {
    baseImage = `node:${nodeJsVersion}`;
    distro = 'standard';
  } else if (family === MUSL) {
    baseImage = `node:${nodeJsVersion}-alpine`;
    distro = 'alpine';
  } else {
    console.error(`Unknown libc family ${family}.`);
    process.exit(1);
  }
  const dockerFile = path.join(__dirname, `Dockerfile.${distro}`);
  const dockerTag = `${family}-autoprofile-native-pack`;
  return {
    //
    baseImage,
    distro,
    dockerFile,
    dockerTag
  };
};
