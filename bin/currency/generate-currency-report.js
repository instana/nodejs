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
    let releaseList = JSON.parse(execSync(`npm show ${currency.name} time --json`).toString());
    delete releaseList.created;
    delete releaseList.modified;

    // NOTE: we ignore pre releases completely for now
    releaseList = Object.keys(releaseList)
      .filter(key => {
        return !semver.prerelease(key) && semver.valid(key);
      })
      .reduce((obj, key) => {
        obj[key] = releaseList[key];
        return obj;
      }, {});

    // CASE: sort all versions by name ASC
    const keys = Object.keys(releaseList).sort((a, b) => {
      if (semver.gt(a, b)) {
        return 1;
      }

      return -1;
    });

    latestVersion = keys[keys.length - 1];

    if (!installedVersion) {
      installedVersion = latestVersion;
    } else {
      installedVersion = installedVersion.replace(/[^0-9.]/g, '');
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
        const currentMajorVersion = semver.major(installedVersion);

        // CASE: 3.3.0 is supported -> [..., 3.3.0, 3.4.0, 3.5.0, ...] -> 3.4.0 is the next available version
        //       we need need to reference the date from.
        // CASE: [..., 3.3.0, 3.4.0, 4.0.0, 3.5.0]
        let nextAvailableVersionIndex;
        keys.slice(keys.indexOf(installedVersion) + 1).every(key => {
          if (semver.major(key) === currentMajorVersion) {
            nextAvailableVersionIndex = key;
            return false;
          }

          return true;
        });

        // GOAL: Search for major releases happened after the installed version.
        // EDGE CASE: 2.5.0 is supported [..., 3.0.0, 2.3.0, 3.0.1, 2.4.0, 2.5.0]
        //            3.0.0 is what we are interested in -> behind since 3.0.0
        let latestNextMajorVersionIndex;

        keys.every(key => {
          try {
            if (semver.major(key) > currentMajorVersion) {
              latestNextMajorVersionIndex = key;
              return false;
            }
          } catch (err) {
            // ignore e.g. there are some keys in the array we just ignore
          }

          return true;
        });

        if (latestNextMajorVersionIndex) {
          nextAvailableVersionIndex = latestNextMajorVersionIndex;
        }

        daysBehind = moment(new Date())
          .startOf('day')
          .diff(moment(new Date(releaseList[nextAvailableVersionIndex])).startOf('day'), 'days');
      } catch (err) {
        console.log(err);
        // ignore
      }
    }

    // We are always up to date when the target lib released a patch or a minor and
    // we are still on track with the policy.
    // We have the currency bot running daily, which bumps us patch and minor releases.
    // There is a bot which generates JIRA cards for all libraries which are "up-to-date"
    // false. It runs daily in the night. We do not want these JIRA cards.
    if (Number(daysBehind) < Number(currency.policy.match(/(\d+)-/)[1]) && diff !== 'major') {
      upToDate = true;
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
    '| Package name | Last Supported Version | Latest Version | Latest Version Published At | Support Policy | Days behind | Up-to-date | Note | Depri-cated | Cloud Native | Beta version |\n';

  markdown +=
    // eslint-disable-next-line max-len
    '|--------------|---------|---------|-----------------------------|----------------|-------------|------------|------|------------|--------------|--------------|\n';

  // eslint-disable-next-line no-restricted-syntax
  for (const entry of data) {
    // eslint-disable-next-line max-len
    markdown += `| ${entry.name} | ${entry.lastSupportedVersion} | ${entry.latestVersion} | ${entry.publishedAt} | ${entry.policy} | ${entry.daysBehind} day/s | ${entry.upToDate} | ${entry.note} | ${entry.deprecated} | ${entry.cloudNative} | ${entry.isBeta} |\n`;
  }

  return markdown;
}

const markdown = jsonToMarkdown(currencies);
fs.writeFileSync(path.join(__dirname, '..', '..', 'currency-report.md'), markdown);
