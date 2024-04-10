/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const semver = require('semver');
const { execSync } = require('child_process');
const currencies = require(path.join(__dirname, '..', '..', 'currencies.json'));
const utils = require('./utils');
const MAJOR_UPDATES_MODE = process.env.MAJOR_UPDATES_MODE ? process.env.MAJOR_UPDATES_MODE === 'true' : false;
const BRANCH = process.env.BRANCH;
const cwd = path.join(__dirname, '..', '..');

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');
let branchName = BRANCH;

if (!MAJOR_UPDATES_MODE) {
  console.log('Preparing patch/minor updates...');
  execSync('git checkout main', { cwd });
  execSync('npm i --no-audit', { cwd });
  execSync(`git checkout -b ${branchName}`, { cwd });
}

currencies.forEach(currency => {
  console.log(`Checking currency update for ${currency.name}`);

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

    console.log(`Major update available for ${currency.name}.`);
    execSync('git checkout main', { cwd });
    execSync('npm i --no-audit', { cwd });

    branchName = `${BRANCH}-${currency.name.replace(/[^a-zA-Z0-9]/g, '')}`;

    try {
      execSync(`git ls-remote --exit-code --heads origin ${branchName}`, { cwd });
      console.log(`Skipping ${currency.name}. Branch exists.`);
      return;
    } catch (err) {
      // ignore err
      // CASE: branch does not exist, continue
    }

    execSync(`git checkout -b ${branchName}`, { cwd });
  }

  if (isRootDependency) {
    console.log(`npm i -D ${currency.name}@${latestVersion} --no-audit`);
    execSync(`npm i -D ${currency.name}@${latestVersion} --no-audit`, { stdio: 'inherit', cwd });
  } else {
    const subpkg = utils.getPackageName(currency.name);
    console.log(`npm i -D ${currency.name}@${latestVersion} -w ${subpkg} --no-audit`);
    execSync(`npm i -D ${currency.name}@${latestVersion} -w ${subpkg} --no-audit`, { stdio: 'inherit', cwd });
  }

  if (MAJOR_UPDATES_MODE) {
    execSync('git add *package.json package-lock.json', { cwd });
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });
    execSync(`git push origin ${branchName} --no-verify`, { cwd });
    execSync(
      // eslint-disable-next-line max-len
      `gh pr create --base main --head ${branchName} --title "[Currency Bot] Bumped ${currency.name} from ${installedVersion} to ${latestVersion}" --body "Tada!"`,
      { cwd }
    );
  } else {
    execSync('git add *package.json package-lock.json', { cwd });
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });
  }
});

if (!MAJOR_UPDATES_MODE) {
  execSync(`git push origin ${branchName} --no-verify`, { cwd });
  execSync(
    // eslint-disable-next-line max-len
    `gh pr create --base main --head ${branchName} --title "[Currency Bot] Bumped patch/minor dependencies" --body "Tada!"`,
    { cwd }
  );
}
