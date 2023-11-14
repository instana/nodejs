/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { GLIBC, MUSL } = require('detect-libc');

const nodeJsVersion = '18.16.0';

module.exports = exports = function getDockerOpts(family, version) {
  let baseImage;
  let distro;
  const targetNodeVersion = version || nodeJsVersion;

  if (family === GLIBC) {
    // NOTE: debian stretch was no longer working good with some Node versions
    // https://stackoverflow.com/questions/76094428/debian-stretch-repositories-404-not-found
    // https://stackoverflow.com/questions/52083380/in-docker-image-names-what-is-the-difference-between-alpine-jessie-stretch-an
    baseImage = `node:${targetNodeVersion}-buster`;
    distro = 'standard';
  } else if (family === MUSL) {
    baseImage = `node:${targetNodeVersion}-alpine`;
    distro = 'alpine';
  } else {
    console.error(`Unknown libc family ${family}.`);
    process.exit(1);
  }
  const dockerFile = path.join(__dirname, `Dockerfile.${distro}`);
  const dockerTag = `${family}-${targetNodeVersion}-autoprofile-native-pack`;
  return {
    //
    baseImage,
    distro,
    dockerFile,
    dockerTag
  };
};
