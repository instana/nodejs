/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');
const { execSync } = require('child_process');
const fs = require('fs');
const currenciesPath = path.join(__dirname, '..', '..', '..', 'currencies.json');
const currencies = require(currenciesPath);
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

  const { version: installedVersion, versionObj: installedVersionObj } = utils.getLatestInstalledVersion(currency);

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

  const isMinorOrPatchUpdate = semver.major(latestVersion) === semver.major(installedVersion);

  if (!MAJOR_UPDATES_MODE && !isMinorOrPatchUpdate) {
    console.log(`Skipping ${currency.name}. Major updates not allowed.`);
    return;
  }

  // --- START OF FIX ---
  let targetCurrencies = currencies;
  let targetCurrency = currency;

  if (MAJOR_UPDATES_MODE) {
    if (isMinorOrPatchUpdate) {
      console.log(`Skipping ${currency.name}. No major update available.`);
      return;
    }

    console.log(`Major update available for ${currency.name}.`);
    branchName = utils.createBranchName(BRANCH, currency.name, latestVersion);

    if (utils.branchExists(branchName, cwd)) {
      console.log(`Skipping ${currency.name}. Branch exists.`);
      return;
    }

    if (!DRY_RUN) {
      // 1. Reset the environment to the clean base branch for every major update
      execSync(`git checkout ${BRANCH}`, { cwd });
      execSync('git checkout -- currencies.json', { cwd });

      // 2. Re-read the file so we don't have previous iterations' changes in memory
      const freshData = fs.readFileSync(currenciesPath, 'utf8');
      targetCurrencies = JSON.parse(freshData);
      targetCurrency = targetCurrencies.find(c => c.name === currency.name);
    }

    utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main');
  }
  // --- END OF FIX ---

  // Update versions array
  const installedVersionIndex = targetCurrency.versions.findIndex(vObj => {
    const v = typeof vObj === 'string' ? vObj : vObj.v;
    return v === installedVersion;
  });

  const newVersionObj =
    typeof installedVersionObj === 'string' ? latestVersion : { ...installedVersionObj, v: latestVersion };

  if (MAJOR_UPDATES_MODE && !isMinorOrPatchUpdate) {
    targetCurrency.versions.unshift(newVersionObj);
  } else {
    targetCurrency.versions = targetCurrency.versions.filter(vObj => {
      const v = typeof vObj === 'string' ? vObj : vObj.v;
      return v !== installedVersion;
    });
    targetCurrency.versions.splice(installedVersionIndex, 0, newVersionObj);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(currenciesPath, JSON.stringify(targetCurrencies, null, 2));
  } else {
    console.log(`[DRY RUN] Updated currencies.json with ${currency.name} version ${latestVersion}`);
  }

  if (MAJOR_UPDATES_MODE) {
    utils.commitAndCreatePR({
      packageName: currency.name,
      files: 'currencies.json',
      currentVersion: installedVersion,
      newVersion: latestVersion,
      branchName,
      cwd,
      skipPush: SKIP_PUSH,
      prTitle: `[Currency Bot] Bumped ${currency.name} from ${installedVersion} to ${latestVersion}`
    });

    // Return to main branch after creating PR to avoid staying on a "dirty" branch
    if (!DRY_RUN) {
      execSync(`git checkout ${BRANCH}`, { cwd });
    }
  } else if (!DRY_RUN) {
    try {
      execSync("git add 'currencies.json'", { cwd });
      execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });
    } catch (error) {
      console.error(`Failed to commit changes: ${error.message}`);
    }
  } else {
    console.log(
      `[DRY RUN] git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`
    );
  }
});

// For non-major updates, push all changes at once
if (!MAJOR_UPDATES_MODE) {
  if (utils.hasCommits(branchName, cwd)) {
    if (!SKIP_PUSH) {
      try {
        execSync(`git push origin ${branchName} --no-verify`, { cwd });
        const prTitle = '[Currency Bot] Bumped patch/minor dependencies';
        execSync(`gh pr create --base main --head ${branchName} --title "${prTitle}" --body "Tada!"`, { cwd });
      } catch (error) {
        console.error(`Failed to push changes: ${error.message}`);
      }
    }
  } else {
    console.log(`Branch ${branchName} has no commits.`);
  }
}
