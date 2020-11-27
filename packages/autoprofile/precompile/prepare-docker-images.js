'use strict';

const { GLIBC, MUSL } = require('detect-libc');

const execute = require('./execute-sync');
const getDockerOpts = require('./docker-opts');

const getOutput = execute.getOutput;

module.exports = exports = function prepareDockerImages(libcFamilies) {
  libcFamilies.forEach(family => {
    const {
      //
      baseImage,
      distro,
      dockerFile,
      dockerTag
    } = getDockerOpts(family);

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
