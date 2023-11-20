/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const execute = require('./execute-sync');
const getDockerOpts = require('./docker-opts');

module.exports = exports = function buildOnDocker(platform, family, abi, version) {
  const { dockerTag } = getDockerOpts(family, version);

  console.log(`Stopping and removing ${dockerTag}.`);
  execute(`docker stop ${dockerTag} > /dev/null || true`);
  execute(`docker rm -f ${dockerTag} > /dev/null || true`);
  // The directory packages/autoprofile (e.g. ../..) is mounted into the container and
  // `node precompile/build-wrapper.js` is the container's entrypoint. After running the container, the compiled binary
  // will have been written to ../addons/linux/x64/...
  console.log(
    `Running node-gyp for ${platform}/${family}/ABI ${abi} (target=${version}) on Docker container ${dockerTag} now:`
  );

  // NOTE: we need to bind the root dependencies, because mkdirp & node-gyp is not installed in autoprofile package
  const rootModules = path.join(__dirname, '..', '..', '..', 'node_modules');
  execute(`docker run \
           --mount type=bind,source="$(pwd)",target=/opt/autoprofile \
           --mount type=bind,source="${rootModules}",target=/opt/autoprofile/node_modules \
           --name ${dockerTag} ${dockerTag} \
           ${abi} \
           ${version}
          `);
};
