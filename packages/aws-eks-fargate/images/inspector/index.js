/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const http = require('http');
const k8s = require('@kubernetes/client-node');

const app = new http.Server();
const port = 3000;

const { promises: fs } = require('fs');
const fetch = require('node-fetch');

// const metadataFileEnvVar = 'ECS_CONTAINER_METADATA_FILE';
// const metadataUriEnvVarV3 = 'ECS_CONTAINER_METADATA_URI';
// const metadataUriEnvVarV4 = 'ECS_CONTAINER_METADATA_URI_V4';

async function inspect() {
  const result = ['\n================\nInspecting Task Environment:\n'];
  result.push(`Node.js version: ${process.versions.node}`);

  // All of the below exists in ECS, but apparently not in EKS. At least not by default. Or not at all.
  // result.push('Inspecting: Amazon ECS container metadata file (opt-in)');
  // const metadataFile = process.env[metadataFileEnvVar];
  // if (metadataFile) {
  //   result.push(`Environment variable ${metadataFileEnvVar} is set to: ${metadataFile}`);
  //   await inspectFile(result, metadataFile);
  // } else {
  //   result.push(`Environment variable ${metadataFileEnvVar} is not set.`);
  // }

  // result.push('Inspecting: Task metadata endpoint version 3');
  // const metadataUriV3 = process.env[metadataUriEnvVarV3];
  // if (metadataUriV3) {
  //   result.push(`Environment variable ${metadataUriEnvVarV3} is set to: ${metadataUriV3}`);
  //   await inspectMetadataEndpoint(result, metadataUriV3);
  // } else {
  //   result.push(`Environment variable ${metadataUriEnvVarV3} is not set.`);
  // }

  // result.push('Inspecting: Task metadata endpoint version 4');
  // const metadataUriV4 = process.env[metadataUriEnvVarV4];
  // if (metadataUriV4) {
  //   result.push(`Environment variable ${metadataUriEnvVarV4} is set to: ${metadataUriV4}`);
  //   await inspectMetadataEndpoint(result, metadataUriV4);
  // } else {
  //   result.push(`Environment variable ${metadataUriEnvVarV4} is not set.`);
  // }

  dumpAllEnvVars(result);

  result.push('Inspecting: Kubernetes API');
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    const podsRes = await k8sApi.listNamespacedPod('default');
    dump(result, `Result of kc.makeApiClient(k8s.CoreV1Api):`, JSON.stringify(podsRes, null, 2));
  } catch (e) {
    result.push('Error: The K8s API call failed:', e);
  }

  await inspectFileSystemRecursively(result, '/proc');

  // await inspectFile(result, '/var/run/secrets/kubernetes.io/serviceaccount/token');
  // await inspectFile(result, '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
  await inspectFile(result, '/var/run/secrets/kubernetes.io/serviceaccount/namespace');

  await inspectFile(result, '/proc/self/mountinfo');
  await inspectFile(result, '/proc/1/mountinfo');
  await inspectFile(result, '/proc/self/cpuset');
  await inspectFile(result, '/proc/1/cpuset');

  return result;
}

async function inspectFileSystemRecursively(result, filepath, maxEntries = 10000) {
  let dirEntries;
  try {
    dirEntries = await fs.readdir(filepath, { withFileTypes: true, recursive: true });
  } catch (e) {
    if (e.code === 'ENOENT') {
      result.push(`WARNING: ${filepath} does not exist.`);
      return;
    } else {
      throw e;
    }
  }
  for (let i = 0; i < dirEntries.length; i++) {
    const dirEntry = dirEntries[i];
    result.push(`${dirEntry.path}/${dirEntry.name}`);
    if (dirEntry.name.includes('cpuset')) {
      await inspectFile(result, `${dirEntry.path}/${dirEntry.name}`);
    }
    if (i >= maxEntries) {
      dump(
        result,
        'WARNING',
        `${dirEntries.length} number of files found in ${filepath}, this exceeds the limit of ${maxEntries}, result will be incomplete!`
      );
      break;
    }
  }
}

async function inspectFile(result, filepath) {
  try {
    const content = await fs.readFile(filepath);
    return dump(result, `file content (${filepath}):`, content.toString());
  } catch (e) {
    if (e.code === 'ENOENT') {
      result.push(`Error: File does not exist: ${filepath}.`);
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

function dumpAllEnvVars(result) {
  for (const key of Object.keys(process.env)) {
    result.push(`Environment variable: ${key} = ${process.env[key]}`);
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
