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
const utils = require('../utils');
const MAJOR_UPDATES_MODE = process.env.MAJOR_UPDATES_MODE ? process.env.MAJOR_UPDATES_MODE === 'true' : false;
const BRANCH = process.env.BRANCH;
const SKIP_PUSH = process.env.SKIP_PUSH === 'true';
const cwd = path.join(__dirname, '..', '..', '..');
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');

const loadCurrencies = () => {
  delete require.cache[require.resolve(currenciesPath)];
  return require(currenciesPath);
};

let currencies = loadCurrencies();

console.log(`MAJOR_UPDATES_MODE: ${MAJOR_UPDATES_MODE}`);
console.log(`BRANCH: ${BRANCH}`);
console.log(`SKIP_PUSH: ${SKIP_PUSH}`);
console.log('==============\n');

if (!MAJOR_UPDATES_MODE) {
  console.log('[INIT] Preparing batch (patch/minor) updates...');
  utils.prepareGitEnvironment(BRANCH, cwd, BRANCH === 'main', DRY_RUN);
}

currencies.forEach(originalCurrency => {
  let currency = originalCurrency;

  if (MAJOR_UPDATES_MODE) {
    utils.prepareGitEnvironment('main', cwd, true, DRY_RUN);

    currencies = loadCurrencies();
    currency = currencies.find(c => c.name === originalCurrency.name);
  }

  console.log(`-----------${currency.name}-----------`);

  if (currency.ignoreUpdates) {
    console.log(`[SKIP] ${currency.name}. ignoreUpdates is set.`);
    return;
  }

  const { version: installedVersion, versionObj: installedVersionObj } = utils.getLatestInstalledVersion(currency);

  if (!installedVersion) {
    console.log(`[SKIP] ${currency.name}. No installed version(core dependency).`);
    return;
  }

  const latestVersion = utils.getLatestVersion({
    pkgName: currency.name,
    installedVersion,
    isBeta: currency.isBeta
  });

  if (latestVersion === installedVersion) {
    console.log(`[UP-TO-DATE] ${currency.name} already up-to-date (${installedVersion})`);
    return;
  }

  const isMajorUpdate = semver.major(latestVersion) !== semver.major(installedVersion);

  console.log(`[UPDATE] ${currency.name}: ${installedVersion} → ${latestVersion}`);

  if (MAJOR_UPDATES_MODE && !isMajorUpdate) {
    console.log('[SKIP] Not a major update');
    return;
  }

  if (!MAJOR_UPDATES_MODE && isMajorUpdate) {
    console.log(`[SKIP] ${currency.name}. Major updates not allowed.`);
    return;
  }

  let branchName = BRANCH;

  if (MAJOR_UPDATES_MODE) {
    if (!isMajorUpdate) {
      console.log(`[SKIP] ${currency.name}. No major update available.`);
      return;
    }

    console.log(`[UPDATE] Major update available for ${currency.name}.`);
    branchName = utils.createBranchName(BRANCH, currency.name, latestVersion);

    if (utils.branchExists(branchName, cwd)) {
      console.log(`[SKIP] Branch exists: ${branchName}`);
      return;
    }

    utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main', DRY_RUN);
  }

  // 1. update currencies.json versions array
  const installedIndex = currency.versions.findIndex(vObj => {
    const v = typeof vObj === 'string' ? vObj : vObj.v;
    return v === installedVersion;
  });

  const newVersionObj =
    typeof installedVersionObj === 'string' ? latestVersion : { ...installedVersionObj, v: latestVersion };

  // if (isMajorUpdate) {
  //   currency.versions.unshift(newVersionObj);
  // } else {
  currency.versions = currency.versions.filter(vObj => {
    const v = typeof vObj === 'string' ? vObj : vObj.v;
    return v !== installedVersion;
  });
  currency.versions.splice(installedIndex, 0, newVersionObj);
  // }

  if (!DRY_RUN) {
    fs.writeFileSync(currenciesPath, JSON.stringify(currencies, null, 2));
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
  } else if (!DRY_RUN) {
    try {
      execSync("git add 'currencies.json'", { cwd });
      execSync(`git commit -m "build: bumped ${currency.name} from ${installedVersion} to ${latestVersion}"`, { cwd });
    } catch (err) {
      console.error(`[ERROR] Commit failed: ${err.message}`);
    }
  }
});

// For non-major updates, push all changes at once
if (!MAJOR_UPDATES_MODE) {
  if (utils.hasCommits(BRANCH, cwd)) {
    if (!SKIP_PUSH) {
      try {
        execSync(`git push origin ${BRANCH} --no-verify`, { cwd });
        const prTitle = '[Currency Bot] Bumped patch/minor dependencies';
        execSync(`gh pr create --base main --head ${BRANCH} --title "${prTitle}" --body "Tada!"`, { cwd });

        console.log('[DONE] Currency PR created');
      } catch (error) {
        console.error(`[ERROR] Failed to push changes:: ${error.message}`);
      }
    }
  } else {
    console.log(`Branch ${BRANCH} has no commits.`);
  }
}
