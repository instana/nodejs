/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');
const { execSync } = require('child_process');
const currencies = require(path.join(__dirname, '..', '..', 'currencies.json'));
const utils = require('./utils');
const MAJOR_UPDATES_MODE = process.env.MAJOR_UPDATES_MODE ? process.env.MAJOR_UPDATES_MODE === 'true' : false;
const BRANCH = process.env.BRANCH;
const SKIP_PUSH = process.env.SKIP_PUSH === 'true';
const cwd = path.join(__dirname, '..', '..');

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');
let branchName = BRANCH;

console.log(`MAJOR_UPDATES_MODE: ${MAJOR_UPDATES_MODE}`);
console.log(`BRANCH: ${BRANCH}`);
console.log(`SKIP_PUSH: ${SKIP_PUSH}`);

// eslint-disable-next-line no-shadow
const hasCommits = (branch, cwd) => {
  try {
    const result = execSync(`git log main..${branch} --pretty=format:"%h"`, { cwd }).toString().trim();
    console.log(`Commits in branch '${branch}' not in 'main':\n${result}`);
    return result && result.length > 0;
  } catch (err) {
    return false;
  }
};

if (!MAJOR_UPDATES_MODE) {
  console.log('Preparing patch/minor updates...');
  execSync('git checkout main', { cwd });
  execSync('npm i --no-audit', { cwd });

  if (BRANCH !== 'main') {
    execSync(`git checkout -b ${branchName}`, { cwd });
  }
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

  installedVersion = installedVersion.replace(/[^0-9.]/g, '');
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

    if (BRANCH !== 'main') {
      execSync(`git checkout -b ${branchName}`, { cwd });
    }
  }

  if (isRootDependency) {
    if (isDevDependency) {
      console.log(`npm i --save-dev ${currency.name}@${latestVersion} --no-audit`);
      execSync(`npm i --save-dev ${currency.name}@${latestVersion} --no-audit`, { stdio: 'inherit', cwd });
    } else {
      console.log(`npm i --save-optional ${currency.name}@${latestVersion} --no-audit`);
      execSync(`npm i --save-optional ${currency.name}@${latestVersion} --no-audit`, { stdio: 'inherit', cwd });
      // NOTE: run an extra npm install after updating the optional dependencies because of
      //       a bug in npm: https://github.com/npm/cli/issues/7530
      execSync('npm i', { stdio: 'inherit', cwd });
    }
  } else {
    const subpkg = utils.getPackageName(currency.name);
    console.log(`npm i --save-dev ${currency.name}@${latestVersion} -w ${subpkg} --no-audit`);
    execSync(`npm i --save-dev ${currency.name}@${latestVersion} -w ${subpkg} --no-audit`, { stdio: 'inherit', cwd });
  }

  if (MAJOR_UPDATES_MODE) {
    execSync("git add '*package.json' package-lock.json", { cwd });
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });

    if (hasCommits(branchName, cwd)) {
      if (!SKIP_PUSH) {
        execSync(`git push origin ${branchName} --no-verify`, { cwd });
        execSync(
          // eslint-disable-next-line max-len
          `gh pr create --base main --head ${branchName} --title "[Currency Bot] Bumped ${currency.name} from ${installedVersion} to ${latestVersion}" --body "Tada!"`,
          { cwd }
        );
      }
    } else {
      console.log(`Branch ${branchName} has no commits.`);
    }
  } else {
    execSync("git add '*package.json' package-lock.json", { cwd });
    execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });
  }
});

if (!MAJOR_UPDATES_MODE) {
  if (hasCommits(branchName, cwd)) {
    if (!SKIP_PUSH) {
      execSync(`git push origin ${branchName} --no-verify`, { cwd });
      execSync(
        // eslint-disable-next-line max-len
        `gh pr create --base main --head ${branchName} --title "[Currency Bot] Bumped patch/minor dependencies" --body "Tada!"`,
        { cwd }
      );
    }
  } else {
    console.log(`Branch ${branchName} has no commits.`);
  }
}
