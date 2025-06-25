/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * This is just a wrapper around the CLI commands `prebuildify` and `prebuildify-cross`.
 *
 * Instead of using this wrapper, you can manually run the commands:
 * npx prebuildify -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip --arch arm64
 * npx prebuildify-cross --modules ../../node_modules -i linux-arm64 -t node@18.0.0 --strip
 */

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;
const childProcess = require('child_process');

if (!argv.node) {
  throw new Error('Please specify the node version/s.');
}

const targets = argv.node.split(',').join(' -t ');

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
  let archs = ['alpine', 'linux-arm64', 'centos7-devtoolset7', 'linux-armv6', 'linux-armv7', 'linux-s390x'];
  if (argv.arch) {
    archs = argv.arch.split(',');
  }

  console.log(`\n### Building linux prebuilds for ${targets} ${archs}...\n`);

  archs.forEach(image => {
    if (image === 'linux-s390x') {
      // Since there is no official s390x image available in prebuildify-cross yet,
      // we're temporarily using a locally built image. We'll switch to the official image once it's supported.
      image = 'abhilashsivan/prebuild-linux-s390x:strip';

      childProcess.execSync(
        `STRIP=s390x-linux-gnu-strip npx prebuildify-cross --modules ../../node_modules -i ${image} -t ${targets}`,
        {
          stdio: 'inherit'
        }
      );
    } else {
      childProcess.execSync(`npx prebuildify-cross --modules ../../node_modules -i ${image} -t ${targets} --strip`, {
        stdio: 'inherit'
      });
    }
  });
}
