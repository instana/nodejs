/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const fs = require('fs');

// NOTE: default docker compose hosts, ports and credentials
const configPath = path.join(__dirname, '../../../hosts_config.json');
const hostsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

Object.keys(hostsConfig).forEach(key => {
  if (!process.env[key]) {
    process.env[key] = hostsConfig[key];
  }
});
