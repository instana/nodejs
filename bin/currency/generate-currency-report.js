/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const utils = require('./utils');
let currencies = require(path.join(__dirname, '..', '..', 'currencies.json'));

currencies = currencies.sort(function (a, b) {
  const nameA = a.name.toUpperCase();
  const nameB = b.name.toUpperCase();

  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }

  return 0;
});

currencies = currencies.map(currency => {
  let installedVersion = utils.getRootDependencyVersion(currency.name);
  let latestVersion;
  let upToDate;

  if (!installedVersion) {
    installedVersion = utils.getPackageDependencyVersion(currency.name);
  }

  // CASE: core pkg
  if (!installedVersion) {
    installedVersion = latestVersion = 'latest';
    upToDate = true;
  } else {
    installedVersion = installedVersion.replace(/[^0-9.]/g, '');
    latestVersion = execSync(`npm info ${currency.name} version`).toString().trim();
    upToDate = latestVersion === installedVersion;
  }

  currency = { ...currency, latestVersion, lastSupportedVersion: installedVersion, upToDate };
  return currency;
});

function jsonToMarkdown(data) {
  let markdown =
    // eslint-disable-next-line max-len
    `#### This page is auto-generated. Any change will be overwritten after the next sync. Please apply changes directly at https://github.com/instana/nodejs. Generated on ${new Date().toDateString()}.` +
    '\n\n' +
    '# Node.js supported core & third party packages' +
    '\n\n' +
    // eslint-disable-next-line max-len
    '| Package name | Support Policy | Last Supported Version | Latest Version | Cloud Native | Up-to-date | Beta version |\n';

  markdown +=
    // eslint-disable-next-line max-len
    '|--------------|----------------|------------------------|----------------|--------------|------------|--------------|\n';

  // eslint-disable-next-line no-restricted-syntax
  for (const entry of data) {
    // eslint-disable-next-line max-len
    markdown += `| ${entry.name} | ${entry.policy} | ${entry.lastSupportedVersion} | ${entry.latestVersion} | ${entry.cloudNative} | ${entry.upToDate} | ${entry.isBeta} |\n`;
  }

  return markdown;
}

const markdown = jsonToMarkdown(currencies);
fs.writeFileSync(path.join(__dirname, '..', 'currency-report.md'), markdown);
