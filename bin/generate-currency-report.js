/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const pkgjson = require(path.join(__dirname, '..', 'package.json'));
let currencies = require(path.join(__dirname, '..', 'currencies.json'));

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
  let lastSupportedVersion = pkgjson.devDependencies[currency.name] || pkgjson.optionalDependencies[currency.name];
  let latestVersion;
  let upToDate;

  if (!lastSupportedVersion) {
    const dirs = fs.readdirSync(path.join(__dirname, '..', 'packages'));

    lastSupportedVersion = dirs
      .map(dir => {
        try {
          const subpkgjson = require(path.join(__dirname, '..', 'packages', dir, 'package.json'));
          return subpkgjson.devDependencies?.[currency.name] || subpkgjson.optionalDependencies?.[currency.name];
        } catch (error) {
          return undefined;
        }
      })
      .find(version => version !== undefined);
  }

  // CASE: core pkg
  if (!lastSupportedVersion) {
    lastSupportedVersion = latestVersion = 'latest';
    upToDate = true;
  } else {
    lastSupportedVersion = lastSupportedVersion.replace(/[^0-9.]/g, '');

    latestVersion = execSync(`npm info ${currency.name} version`).toString().trim();
    upToDate = latestVersion === lastSupportedVersion;
  }

  currency = { ...currency, latestVersion, lastSupportedVersion, upToDate };
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
