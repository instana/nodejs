/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-console, no-await-in-loop */

'use strict';

const { promises: fs } = require('fs');
const http = require('http');
const isWhitespace = require('is-whitespace');
const metadataBaseUrl = 'http://metadata.google.internal/computeMetadata/v1/';
const app = new http.Server();

// eslint-disable-next-line instana/no-unsafe-require, import/no-extraneous-dependencies
const getAppPort = require('@instana/collector/test/test_util/app-port');
const port = getAppPort();

async function inspect() {
  const result = ['\n================\nInspecting Container Instance Environment:\n'];
  result.push(`Node.js version: ${process.versions.node}`);
  const envVars = ['HOSTNAME', 'PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION'];
  for (let i = 0; i < envVars.length; i++) {
    dumpEnvVar(result, envVars[i]);
  }

  result.push('Inspecting: Container Instance Metadata Server');

  await inspectMetadataEndpoint(result, metadataBaseUrl);
  await inspectFile(result, '/proc/self/cgroup');
  await inspectFile(result, `/proc/${process.pid}/sched`);
  await inspectFile(result, `/proc/${process.pid}/cpuset`);

  logInstanceId();

  return result;
}

async function inspectMetadataEndpoint(result, metadataUrl) {
  // See
  // https://cloud.google.com/run/docs/reference/container-contract#metadata-server
  // and
  // https://cloud.google.com/compute/docs/storing-retrieving-metadata#default

  const all = [
    { base: 'project/', endpoints: ['', 'attributes/', 'numeric-project-id', 'project-id'] },
    {
      base: 'instance/',
      endpoints: [
        '',
        'attributes/',
        'attributes/ssh-keys',
        'cpu-platform',
        'description',
        'disks/',
        'guest-attributes/',
        'hostname',
        'id',
        'machine-type',
        'maintenance-event',
        'name',
        'network-interfaces/',
        'region/',
        'scheduling/',
        'scheduling/automatic-restart',
        'scheduling/on-host-maintenance',
        'scheduling/preemptible',
        'service-accounts/',
        'service-accounts/default/token',
        'service-accounts/service-account-name/identity',
        'service-accounts/service-account-name/token',
        'tags',
        'zone'
      ]
    }
  ];
  for (let i = 0; i < all.length; i++) {
    try {
      const config = all[i];
      await inspectMultipleEndpoints(result, `${metadataUrl}${config.base}`, config.endpoints);
    } catch (e) {
      console.error(e);
      dumpError(
        result,
        'Error: Encountered an error while inspecting the container instance metadata endpoint version 1:',
        e
      );
    }
  }
}

async function inspectMultipleEndpoints(result, baseUrl, endpoints) {
  let url;
  for (let i = 0; i < endpoints.length; i++) {
    try {
      url = `${baseUrl}${endpoints[i]}`;
      result.push(await dumpHttpResponse(result, url));
    } catch (e) {
      console.error(e);
      dumpError(result, `Error: Encountered an error while inspecting ${url}`, e);
    }
  }
}

async function inspectFile(result, file) {
  try {
    const content = await fs.readFile(file);
    return dump(result, `File content for ${file}`, content.toString());
  } catch (e) {
    console.log(e);
    if (e.code === 'ENOENT') {
      result.push(`Error: The file ${file} does not exist.`);
    } else {
      dumpError(result, `Error: Encounterd an error while trying to read ${file}`, e);
    }
  }
}

async function dumpHttpResponse(result, url) {
  let responsePayload;
  try {
    if (url.charAt(url.length - 1) === '/') {
      url = `${url}?recursive=true`;
    }
    const response = await fetch(url, {
      headers: { 'Metadata-Flavor': 'Google' }
    });
    responsePayload = await response.text();
  } catch (e) {
    console.error(e);
    dumpError(result, `Error: Encountered an error while fetching data from ${url}:`, e);
  }
  if (responsePayload) {
    try {
      const json = JSON.parse(responsePayload);
      dump(result, `JSON response from ${url}:`, JSON.stringify(json, null, 2));
    } catch (e) {
      dump(result, `Text content from ${url}:`, responsePayload);
    }
  } else {
    result.push(`No response from ${url}.`);
  }
}

function dumpEnvVar(result, envVarKey) {
  const value = process.env[envVarKey];
  if (value) {
    result.push(`Environment variable: ${envVarKey} = ${value}`);
  } else {
    result.push(`Environment variable ${envVarKey} is not set.`);
  }
}

function dumpError(result, title, error) {
  result.push(`${title}: <<<`);
  result.push(String(error.stack || error.message || error));
  result.push('>>>\n');
}

function dump(result, title, text) {
  if (text && !isWhitespace(text)) {
    result.push(`${title}: <<<`);
    result.push(text);
    result.push('>>> EOF\n');
  } else {
    result.push(`${title}: no content\n`);
  }
}

async function logInstanceId() {
  const instanceIdResponse = await fetch(`${metadataBaseUrl}instance/id`, {
    headers: { 'Metadata-Flavor': 'Google' }
  });
  const responsePayload = await instanceIdResponse.text();
  console.log('instance id from metadata server', responsePayload);
}

app.on('request', async (req, res) => {
  /* eslint-disable no-console */
  try {
    console.log('Starting inspection...');
    const result = await inspect();
    console.log('Inspection finished, sending back result.');
    res.end(result.join('\n'));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end(`Inspection failed: ${e.stack || e.message || e}`);
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
