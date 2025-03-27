/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const fs = require('fs');
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');
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
  console.log('\n###############################################');
  console.log(`Checking ${currency.name}...`);

  let installedVersion = utils.getRootDependencyVersion(currency.name);
  let latestVersion;
  let upToDate;
  let latestVersionPublishedAt = 'N/A';
  let daysBehind = '0';

  if (!installedVersion) {
    installedVersion = utils.getPackageDependencyVersion(currency.name);
  }

  // CASE: core pkg
  if (currency.core) {
    installedVersion = latestVersion = 'latest';
    upToDate = true;
  } else {
    // CASE: remove tilde or caret
    if (installedVersion) {
      installedVersion = installedVersion.replace(/[^0-9.]/g, '');
    }

    if (currency.name === 'express') {
      latestVersion = utils.getLatestVersion(currency.name, installedVersion, true);
    } else {
      latestVersion = utils.getLatestVersion(currency.name, installedVersion);
    }

    if (!installedVersion) {
      installedVersion = latestVersion;
    }

    console.log(`Installed version: ${installedVersion}`);
    console.log(`Latest version: ${latestVersion}`);

    const diff = semver.diff(latestVersion, installedVersion);

    // CASE: no new release happened when diff is null
    upToDate = diff === null;

    try {
      latestVersionPublishedAt = new Date(
        JSON.parse(execSync(`npm show ${currency.name} time --json`).toString())[latestVersion]
      );
    } catch (err) {
      // ignore
    }

    if (!upToDate) {
      try {
        const releaseList = JSON.parse(execSync(`npm show ${currency.name} time --json`).toString());
        daysBehind = utils.getDaysBehind(releaseList, installedVersion);
      } catch (err) {
        console.log(err);
        // ignore
      }
    }

    console.log(`Days behind: ${daysBehind}`);

    // We are always up to date when the target lib released a patch or a minor and
    // we are still on track with the policy.
    // We have the currency bot running daily, which bumps us patch and minor releases.
    // There is a bot which generates JIRA cards for all libraries which are "up-to-date"
    // false. It runs daily in the night. We do not want these JIRA cards.

    // NOTE: Possible values are 0-days, 45-days or Deprecated
    if (currency.policy === 'Deprecated') {
      upToDate = true;
    } else {
      const policyDays = currency.policy.match(/(\d+)-/);

      if (policyDays && Number(daysBehind) < Number(policyDays[1]) && diff !== 'major') {
        upToDate = true;
      }
    }
  }

  currency = {
    ...currency,
    latestVersion,
    lastSupportedVersion: installedVersion,
    upToDate,
    publishedAt: latestVersionPublishedAt.toDateString
      ? latestVersionPublishedAt.toDateString()
      : latestVersionPublishedAt,
    daysBehind
  };
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
    '| Package name | Last Supported Version | Latest Version | Latest Version Published At | Support Policy | Days behind | Up-to-date | Note | Cloud Native | Beta version |\n';

  markdown +=
    // eslint-disable-next-line max-len
    '|--------------|---------|---------|-----------------------------|----------------|-------------|------------|------|--------------|--------------|\n';

  // eslint-disable-next-line no-restricted-syntax
  for (const entry of data) {
    // eslint-disable-next-line max-len
    markdown += `| ${entry.name} | ${entry.lastSupportedVersion} | ${entry.latestVersion} | ${entry.publishedAt} | ${entry.policy} | ${entry.daysBehind} day/s | ${entry.upToDate} | ${entry.note} | ${entry.cloudNative} | ${entry.isBeta} |\n`;
  }

  return markdown;
}

const markdown = jsonToMarkdown(currencies);
fs.writeFileSync(path.join(__dirname, '..', '..', 'currency-report.md'), markdown);
