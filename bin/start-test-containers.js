/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/*  eslint-disable no-console, no-await-in-loop */

'use strict';

const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
// eslint-disable-next-line import/no-extraneous-dependencies
const yaml = require('js-yaml');

const args = process.argv.slice(2);
const baseYaml = fs.readFileSync('./docker-compose-base.yaml', 'utf8');
const baseConfig = yaml.load(baseYaml);

const filteredServices = Object.keys(baseConfig.services)
  .filter(service => args.includes(`--${service}`))
  .reduce((acc, service) => {
    acc[service] = baseConfig.services[service];
    return acc;
  }, {});

const filteredConfig = { version: baseConfig.version, services: filteredServices };
const filteredYaml = yaml.dump(filteredConfig);
fs.writeFileSync('./docker-compose.yaml', filteredYaml);

async function stopAndRemoveContainers() {
  try {
    await exec('docker-compose kill');
    await exec('docker-compose rm -f');
  } catch (error) {
    console.error('Error stopping and removing existing containers:', error.message);
  }
}

function startContainersWithLogs() {
  const dockerCompose = spawn('docker-compose', ['-f', './docker-compose.yaml', 'up']);

  dockerCompose.stdout.on('data', data => {
    console.log(`stdout: ${data}`);
  });

  dockerCompose.stderr.on('data', data => {
    console.error(`stderr: ${data}`);
  });

  dockerCompose.on('close', code => {
    console.log(`child process exited with code ${code}`);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT. Cleaning up and exiting...');
    await stopAndRemoveContainers();
    process.exit();
  });
}

(async () => {
  await stopAndRemoveContainers();
  startContainersWithLogs();
})();
