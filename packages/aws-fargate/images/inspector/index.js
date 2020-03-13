'use strict';

const http = require('http');

const app = new http.Server();
const port = 3000;

const { promises: fs } = require('fs');
const fetch = require('node-fetch');

const metadataFileEnvVar = 'ECS_CONTAINER_METADATA_FILE';
const metadataUriEnvVar = 'ECS_CONTAINER_METADATA_URI';

async function inspect() {
  let result = ['\n================\nInspecting Task Environment:\n'];
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
  const metadataUri = process.env[metadataUriEnvVar];
  if (metadataUri) {
    result.push(`Environment variable ${metadataUriEnvVar} is set to: ${metadataUri}`);
    await inspectMetadataEndpointV3(result, metadataUri);
  } else {
    result.push(`Environment variable ${metadataUriEnvVar} is not set.`);
  }

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

async function inspectMetadataEndpointV3(result, metadataUri) {
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
    res.end('Inspection failed.');
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
