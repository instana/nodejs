/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');
const { execSync } = require('child_process');
const currencies = require(path.join(__dirname, '..', '..', 'currencies.json'));
const utils = require('../utils');
const MAJOR_UPDATES_MODE = process.env.MAJOR_UPDATES_MODE ? process.env.MAJOR_UPDATES_MODE === 'true' : false;
const BRANCH = process.env.BRANCH;
const SKIP_PUSH = process.env.SKIP_PUSH === 'true';
const cwd = path.join(__dirname, '..', '..', '..');

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');
let branchName = BRANCH;

console.log(`MAJOR_UPDATES_MODE: ${MAJOR_UPDATES_MODE}`);
console.log(`BRANCH: ${BRANCH}`);
console.log(`SKIP_PUSH: ${SKIP_PUSH}`);

if (!MAJOR_UPDATES_MODE) {
  console.log('Preparing patch/minor updates...');
  utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main');
}

currencies.forEach(currency => {
  console.log(`Checking currency update for ${currency.name}`);

  if (currency.ignoreUpdates) {
    console.log(`Skipping ${currency.name}. ignoreUpdates is set.`);
    return;
  }

  let isDevDependency = true;
  let isRootDependency = true;
  let installedVersion = utils.getDevDependencyVersion(currency.name);

  if (!installedVersion) {
    installedVersion = utils.getOptionalDependencyVersion(currency.name);
    isDevDependency = false;
  }

  if (!installedVersion) {
    installedVersion = utils.getPackageDependencyVersion(currency.name);
    isRootDependency = false;
    isDevDependency = true;
  }

  if (!installedVersion) {
    console.log(`Skipping ${currency.name}. Seems to be a core dependency.`);
    return;
  }

  installedVersion = utils.cleanVersionString(installedVersion);
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

  if (!MAJOR_UPDATES_MODE && semver.major(latestVersion) !== semver.major(installedVersion)) {
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

  if (isRootDependency) {
    const saveFlag = isDevDependency ? '--save-dev' : '--save-optional';
    utils.installPackage({
      packageName: currency.name,
      version: latestVersion,
      cwd,
      saveFlag
    });
  } else {
    const subpkg = utils.getPackageName(currency.name);
    utils.installPackage({
      packageName: currency.name,
      version: latestVersion,
      cwd,
      saveFlag: '--save-dev',
      workspaceFlag: subpkg
    });
  }

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
  } else {
    // For non-major updates, just commit the changes but don't push yet
    execSync("git add '*package.json' package-lock.json", { cwd });
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });
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
