/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const http = require('http');

const app = new http.Server();
const port = 3000;

const { promises: fs } = require('fs');
const metadataFileEnvVar = 'ECS_CONTAINER_METADATA_FILE';
const metadataUriEnvVarV3 = 'ECS_CONTAINER_METADATA_URI';
const metadataUriEnvVarV4 = 'ECS_CONTAINER_METADATA_URI_V4';

async function inspect() {
  const result = ['\n================\nInspecting Task Environment:\n'];
  result.push(`Node.js version: ${process.versions.node}`);

  result.push('Inspecting: Amazon ECS container metadata file (opt-in)');
  const metadataFile = process.env[metadataFileEnvVar];
  if (metadataFile) {
    result.push(`Environment variable ${metadataFileEnvVar} is set to: ${metadataFile}`);
    await inspectMetadataFile(result, metadataFile);
  } else {
    result.push(`Environment variable ${metadataFileEnvVar} is not set.`);
  }

  result.push('Inspecting: Task metadata endpoint version 3');
  const metadataUriV3 = process.env[metadataUriEnvVarV3];
  if (metadataUriV3) {
    result.push(`Environment variable ${metadataUriEnvVarV3} is set to: ${metadataUriV3}`);
    await inspectMetadataEndpoint(result, metadataUriV3);
  } else {
    result.push(`Environment variable ${metadataUriEnvVarV3} is not set.`);
  }

  result.push('Inspecting: Task metadata endpoint version 4');
  const metadataUriV4 = process.env[metadataUriEnvVarV4];
  if (metadataUriV4) {
    result.push(`Environment variable ${metadataUriEnvVarV4} is set to: ${metadataUriV4}`);
    await inspectMetadataEndpoint(result, metadataUriV4);
  } else {
    result.push(`Environment variable ${metadataUriEnvVarV4} is not set.`);
  }

  dumpEnvVar('AWS_INSTANCE_IPV4', result);
  dumpEnvVar('AWS_INSTANCE_PORT', result);
  dumpEnvVar('AVAILABILITY_ZONE', result);
  dumpEnvVar('REGION', result);
  dumpEnvVar('ECS_SERVICE_NAME', result);
  dumpEnvVar('ECS_CLUSTER_NAME', result);
  dumpEnvVar('EC2_INSTANCE_ID', result);
  dumpEnvVar('ECS_TASK_DEFINITION_FAMILY', result);
  dumpEnvVar('ECS_TASK_SET_EXTERNAL_ID', result);
  dumpEnvVar('EC2_INSTANCE_ID', result);

  return result;
}

async function inspectMetadataFile(result, metadataFile) {
  try {
    const metadata = await fs.readFile(metadataFile);
    return dump(result, 'Amazon ECS container metadata file content', metadata.toString());
  } catch (e) {
    if (e.code === 'ENOENT') {
      result.push('Error: The Amazon ECS container metadata file does not exist, although the env var is set.');
    } else {
      throw e;
    }
  }
}

async function inspectMetadataEndpoint(result, metadataUri) {
  try {
    result.push(await dumpHttpResponse(result, metadataUri));
    result.push(await dumpHttpResponse(result, `${metadataUri}/task`));
    result.push(await dumpHttpResponse(result, `${metadataUri}/stats`));
    result.push(await dumpHttpResponse(result, `${metadataUri}/task/stats`));
  } catch (e) {
    result.push('Error: Encountered an error while inspecting the task metadata endpoint version 3:', e);
  }
}

async function dumpHttpResponse(result, uri) {
  let responsePayload;
  try {
    const response = await fetch(uri);
    responsePayload = await response.text();
  } catch (e) {
    result.push(`Error: Encountered an error while fetching data from ${uri}:`, e);
  }
  try {
    const json = JSON.parse(responsePayload);
    dump(result, `JSON response from ${uri}:`, JSON.stringify(json, null, 2));
  } catch (e) {
    dump(result, `Did not get valid JSON from ${uri}, falling back to text:`, responsePayload);
  }
}

function dumpEnvVar(envVarKey, result) {
  const value = process.env[envVarKey];
  if (value) {
    result.push(`Environment variable: ${envVarKey} = ${value}`);
  } else {
    result.push(`Environment variable ${envVarKey} is not set.`);
  }
}

function dump(result, title, text) {
  result.push(`${title}: <<<`);
  result.push(text);
  result.push('>>> EOF\n');
}

app.on('request', async (req, res) => {
  /* eslint-disable no-console */
  try {
    console.log('Starting inspection...');
    const result = await inspect();
    console.log('Inspection finished, sending back result.');
    res.end(result.join('\n'));
  } catch (e) {
    res.statusCode = 500;
    res.end(`Inspection failed: ${e.stack || e.message || e}`);
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
