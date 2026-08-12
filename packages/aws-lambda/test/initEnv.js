/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load hosts_config.json from the repo root so env vars like INSTANA_CONNECT_LOCALSTACK_AWS
// are available to the aws-lambda tests without needing to set them manually.
const configPath = path.join(__dirname, '..', '..', '..', 'hosts_config.json');

if (fs.existsSync(configPath)) {
  const hostsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  Object.keys(hostsConfig).forEach(key => {
    if (!process.env[key]) {
      process.env[key] = hostsConfig[key];
    }
  });
}
