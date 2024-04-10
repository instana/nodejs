/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const semver = require('semver');
const { execSync } = require('child_process');
const currencies = require(path.join(__dirname, '..', '..', 'currencies.json'));
const utils = require('./utils');
const MAJOR_UPDATES_MODE = process.env.MAJOR_UPDATES_MODE ? Boolean(process.env.MAJOR_UPDATES_MODE) : false;
const BRANCH = process.env.BRANCH;

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');
let branchName = BRANCH;

if (!MAJOR_UPDATES_MODE) {
  execSync('git checkout main');
  execSync('npm i');
  execSync(`git checkout -b ${branchName}`);
}

currencies.forEach(currency => {
  if (currency.ignoreUpdates) {
    console.log(`Skipping ${currency.name}. ignoreUpdates is set.`);
    return;
  }

  let installedVersion = utils.getRootDependencyVersion(currency.name);
  let isRootDependency = true;

  if (!installedVersion) {
    installedVersion = utils.getPackageDependencyVersion(currency.name);
    isRootDependency = false;
  }

  if (!installedVersion) {
    console.log(`Skipping ${currency.name}. Seems to be a core dependency.`);
    return;
  }

  installedVersion = installedVersion.replace(/[^0-9.]/g, '');

  const latestVersion = execSync(`npm info ${currency.name} version`).toString().trim();

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

    execSync('git checkout main');
    execSync('npm i');

    branchName = `${BRANCH}-${currency.name.replace(/[^a-zA-Z0-9]/g, '')}`;
    execSync(`git checkout -b ${branchName}`);
  }

  if (isRootDependency) {
    console.log(`npm i -D ${currency.name}@${latestVersion}`);
    execSync(`npm i -D ${currency.name}@${latestVersion}`, { stdio: 'inherit' });
  } else {
    const subpkg = utils.getPackageName(currency.name);
    console.log(`npm i -D ${currency.name}@${latestVersion} -w ${subpkg}`);
    execSync(`npm i -D ${currency.name}@${latestVersion} -w ${subpkg}`, { stdio: 'inherit' });
  }

  if (MAJOR_UPDATES_MODE) {
    execSync('git add package*');
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`);
    execSync(`git push origin ${branchName}`);
    execSync(
      // eslint-disable-next-line max-len
      `gh pr create --base main --head ${branchName} --title "[Currency Bot] Bumped ${currency.name} from ${installedVersion} to ${latestVersion}" --body "Tada!"`
    );
  } else {
    execSync('git add package*');
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`);
  }
});

if (!MAJOR_UPDATES_MODE) {
  execSync(`git push origin ${branchName}`);
  execSync(
    // eslint-disable-next-line max-len
    `gh pr create --base main --head ${branchName} --title "[Currency Bot] Bumped patch/minor dependencies" --body "Tada!"`
  );
}
