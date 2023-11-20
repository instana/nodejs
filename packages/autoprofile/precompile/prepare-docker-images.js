/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const execute = require('./execute-sync');
const getDockerOpts = require('./docker-opts');

const getOutput = execute.getOutput;

module.exports = exports = function prepareDockerImages(libcFamilies, version) {
  libcFamilies.forEach(family => {
    const {
      //
      baseImage,
      dockerFile,
      dockerTag
    } = getDockerOpts(family, version);

    if (process.env.RECREATE) {
      console.log(`Deleting ${dockerTag}, will be recreated.`);
      execute(`docker rm -f ${dockerTag} > /dev/null || true`);
      execute(`docker rmi ${dockerTag} > /dev/null || true`);
    }
    const imageHash = getOutput(`docker images -q ${dockerTag} 2> /dev/null`);
    if (imageHash) {
      console.log(`Image already exists ${imageHash}.`);
    } else {
      console.log(`Building Docker image: ${dockerFile} -> ${dockerTag}.`);
      execute(`docker stop ${dockerTag} > /dev/null || true`);
      execute(`docker build \
        --build-arg BASE_IMAGE=${baseImage} \
        -f ${dockerFile} \
        -t ${dockerTag} \
        .`);
    }
  });
};
