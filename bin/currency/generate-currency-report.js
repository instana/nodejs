/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const fs = require('fs');
// eslint-disable-next-line import/no-extraneous-dependencies
const moment = require('moment');
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
  let installedVersion = utils.getRootDependencyVersion(currency.name);
  let latestVersion;
  let upToDate;
  let latestVersionPublishedAt = 'N/A';
  let daysBehind = '0';

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

    const diff = semver.diff(latestVersion, installedVersion);

    upToDate = diff === 'patch' || diff === null;

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
        const index = Object.keys(releaseList).indexOf(installedVersion);
        // NOTE: +1 is the next release of the current installed version!
        let key = Object.keys(releaseList)[index + 1];

        if (key === latestVersion) {
          daysBehind = moment(new Date()).startOf('day').diff(moment(latestVersionPublishedAt).startOf('day'), 'days');
        } else {
          // CASE: no release happened after the previous release
          //       e.g. 2.x release happened after 3.x release (valid use case)
          // eslint-disable-next-line no-lonely-if
          if (!key) {
            key = Object.keys(releaseList)[index];
            daysBehind = moment(new Date())
              .startOf('day')
              .diff(moment(new Date(releaseList[key])).startOf('day'), 'days');
          } else {
            daysBehind = moment(latestVersionPublishedAt)
              .startOf('day')
              .diff(moment(new Date(releaseList[key])).startOf('day'), 'days');
          }
        }
      } catch (err) {
        console.log(err);
        // ignore
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
    '|--------------|------------------------|----------------|-----------------------------|----------------|-------------|------------|------|--------------|--------------|\n';

  // eslint-disable-next-line no-restricted-syntax
  for (const entry of data) {
    // eslint-disable-next-line max-len
    markdown += `| ${entry.name} | ${entry.lastSupportedVersion} | ${entry.latestVersion} | ${entry.publishedAt} | ${entry.policy} | ${entry.daysBehind} day/s | ${entry.upToDate} | ${entry.note} | ${entry.cloudNative} | ${entry.isBeta} |\n`;
  }

  return markdown;
}

const markdown = jsonToMarkdown(currencies);
fs.writeFileSync(path.join(__dirname, '..', '..', 'currency-report.md'), markdown);
