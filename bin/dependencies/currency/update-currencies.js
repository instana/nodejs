/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');
const { execSync } = require('child_process');
const fs = require('fs');
const currencies = require(path.join(__dirname, '..', '..', '..', 'currencies.json'));
const utils = require('../utils');
const MAJOR_UPDATES_MODE = process.env.MAJOR_UPDATES_MODE ? process.env.MAJOR_UPDATES_MODE === 'true' : false;
const BRANCH = process.env.BRANCH;
const SKIP_PUSH = process.env.SKIP_PUSH === 'true';
const cwd = path.join(__dirname, '..', '..', '..');
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');
let branchName = BRANCH;

console.log(`MAJOR_UPDATES_MODE: ${MAJOR_UPDATES_MODE}`);
console.log(`BRANCH: ${BRANCH}`);
console.log(`SKIP_PUSH: ${SKIP_PUSH}`);

if (!MAJOR_UPDATES_MODE) {
  console.log('Preparing patch/minor updates...');
  utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main', DRY_RUN);
}

currencies.forEach(currency => {
  console.log(`Checking currency update for ${currency.name}`);

  if (currency.ignoreUpdates) {
    console.log(`Skipping ${currency.name}. ignoreUpdates is set.`);
    return;
  }

  const installedVersionObj = currency.versions[0];
  const installedVersion = typeof installedVersionObj === 'string' ? installedVersionObj : installedVersionObj.v;

  if (!installedVersion) {
    console.log(`Skipping ${currency.name}. Seems to be a core dependency.`);
    return;
  }

  const latestVersion = utils.getLatestVersion({
    pkgName: currency.name,
    installedVersion: installedVersion,
    isBeta: currency.isBeta
  });

  if (latestVersion === installedVersion) {
    console.log(
      `Skipping ${currency.name}. Installed version is ${installedVersion}. Latest version is ${latestVersion}`
    );
    return;
  }

  console.log(`Latest version: ${latestVersion}`);
  console.log(`Installed version: ${installedVersion}`);

  const isMajorUpdate = semver.major(latestVersion) === semver.major(installedVersion);

  if (!MAJOR_UPDATES_MODE && !isMajorUpdate) {
    console.log(`Skipping ${currency.name}. Major updates not allowed.`);
    return;
  }

  if (MAJOR_UPDATES_MODE) {
    if (semver.major(latestVersion) === semver.major(installedVersion)) {
      console.log(`Skipping ${currency.name}. No major update available.`);
      return;
    }

    console.log(`Major update available for ${currency.name}.`);
    branchName = utils.createBranchName(BRANCH, currency.name, latestVersion);

    if (utils.branchExists(branchName, cwd)) {
      console.log(`Skipping ${currency.name}. Branch exists.`);
      return;
    }

    utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main');
  }

  // 1. update currencies.json versions array
  const installedVersionIndex = currency.versions.findIndex(vObj => {
    const v = typeof vObj === 'string' ? vObj : vObj.v;
    return v === installedVersion;
  });

  if (MAJOR_UPDATES_MODE && isMajorUpdate) {
    const newVersionObj =
      typeof installedVersionObj === 'string' ? latestVersion : { ...installedVersionObj, v: latestVersion };
    currency.versions.unshift(newVersionObj);
  } else {
    currency.versions = currency.versions.filter(vObj => {
      const v = typeof vObj === 'string' ? vObj : vObj.v;
      return v !== installedVersion;
    });
    const newVersionObj =
      typeof installedVersionObj === 'string' ? latestVersion : { ...installedVersionObj, v: latestVersion };
    currency.versions.splice(installedVersionIndex, 0, newVersionObj);
  }

  fs.writeFileSync(path.join(__dirname, '..', '..', '..', 'currencies.json'), JSON.stringify(currencies, null, 2));

  if (MAJOR_UPDATES_MODE) {
    utils.commitAndCreatePR({
      packageName: currency.name,
      currentVersion: installedVersion,
      newVersion: latestVersion,
      branchName,
      cwd,
      skipPush: SKIP_PUSH,
      prTitle: `[Currency Bot] Bumped ${currency.name} from ${installedVersion} to ${latestVersion}`
    });
  } else if (!DRY_RUN) {
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });
  } else {
    // eslint-disable-next-line max-len
    console.log(
      `[DRY RUN] git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`
    );
  }
});

// For non-major updates, push all changes at once
if (!MAJOR_UPDATES_MODE) {
  if (utils.hasCommits(branchName, cwd)) {
    if (!SKIP_PUSH) {
      execSync(`git push origin ${branchName} --no-verify`, { cwd });
      // eslint-disable-next-line max-len
      const prTitle = '[Currency Bot] Bumped patch/minor dependencies';
      execSync(`gh pr create --base main --head ${branchName} --title "${prTitle}" --body "Tada!"`, { cwd });
    }
  } else {
    console.log(`Branch ${branchName} has no commits.`);
  }
}
