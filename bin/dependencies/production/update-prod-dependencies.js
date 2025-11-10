/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');
const utils = require('../utils');

const BRANCH = process.env.BRANCH;
const DRY_RUN = process.env.DRY_RUN === 'true';
const PROD_DEPS_PR_LIMIT = process.env.PROD_DEPS_PR_LIMIT || 5;
const PROD_DEPS_ORG_PR_LIMIT = process.env.PROD_DEPS_ORG_PR_LIMIT || 2;
const PROD_DEPS_SKIP = process.env.PROD_DEPS_SKIP ? process.env.PROD_DEPS_SKIP.split(',').map(p => p.trim()) : [];
const cwd = path.join(__dirname, '..', '..', '..');

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');

console.log(`BRANCH: ${BRANCH}`);
console.log(`DRY_RUN: ${DRY_RUN}`);
console.log(`PROD_DEPS_PR_LIMIT: ${PROD_DEPS_PR_LIMIT}`);
console.log(`PROD_DEPS_ORG_PR_LIMIT: ${PROD_DEPS_ORG_PR_LIMIT}`);
console.log(`PROD_DEPS_SKIP: ${PROD_DEPS_SKIP.length ? PROD_DEPS_SKIP.join(', ') : '(none)'}`);

const updatedProdDeps = [];
const orgPrCount = {};

const packagesDir = path.join(__dirname, '..', '..', '..', 'packages');
const pkgPaths = utils.getPackageJsonPathsUnderPackagesDir(packagesDir);

const dependencyMap = {};
pkgPaths.forEach(obj => {
  const pkgJson = require(obj.pkgJsonAbsPath);
  const deps = pkgJson.dependencies || {};
  Object.entries(deps).forEach(([dep, version]) => {
    // Exclude internal libraries
    if (dep.startsWith('@instana')) return;

    if (!dependencyMap[dep]) dependencyMap[dep] = [];
    dependencyMap[dep].push({ pkgRelDir: obj.pkgRelDir, version });
  });
});

Object.entries(dependencyMap).some(([dep, usageList]) => {
  if (updatedProdDeps.length >= PROD_DEPS_PR_LIMIT) return true;

  const orgName = dep.startsWith('@') ? dep.split('/')[0] : null;

  if (orgName && (orgPrCount[orgName] || 0) >= PROD_DEPS_ORG_PR_LIMIT) {
    console.log(`Skipping ${dep}. ${orgName} has reached its PR limit (${PROD_DEPS_ORG_PR_LIMIT}).`);
    return false;
  }

  const currentVersion = utils.cleanVersionString(usageList[0].version);
  const latestVersion = utils.getLatestVersion({
    pkgName: dep,
    installedVersion: currentVersion,
    isBeta: false
  });

  if (!latestVersion || latestVersion === currentVersion) return false;

  const branchName = utils.createBranchName(BRANCH, dep, latestVersion);
  console.log(`Preparing PR for ${dep} (${currentVersion} -> ${latestVersion})`);

  try {
    // CASE: PROD_DEPS_SKIP="pino,@opentelemetry/instrumentation-tedious"
    if (PROD_DEPS_SKIP.includes(dep)) {
      console.log(`Skipping ${dep}. It is listed in PROD_DEPS_SKIP.`);
      return false;
    }

    // CASE: PROD_DEPS_SKIP="pino,@opentelemetry/instrumentation-tedious@2" (to skip all v2 updates)
    if (
      PROD_DEPS_SKIP.some(skipEntry => {
        const matched = skipEntry.match(/^(.*)@(\d+)$/);
        if (!matched) return false;

        const skipDep = matched[1];
        const skipMajorVersion = matched[2];

        if (skipDep !== dep) return false;

        const latestMajorVersion = semver.major(latestVersion).toString();
        return latestMajorVersion === skipMajorVersion;
      })
    ) {
      console.log(`Skipping ${dep}. It is listed in PROD_DEPS_SKIP.`);
      return false;
    }

    if (utils.branchExists(branchName, cwd)) {
      console.log(`Skipping ${dep}. Branch ${branchName} already exists.`);
      return false;
    }

    utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main', DRY_RUN);

    usageList.forEach(({ pkgRelDir }) => {
      utils.installPackage({
        packageName: dep,
        version: latestVersion,
        cwd,
        saveFlag: '',
        workspaceFlag: pkgRelDir,
        isDryRun: DRY_RUN
      });
    });

    const prCreated = utils.commitAndCreatePR({
      packageName: dep,
      currentVersion: currentVersion,
      newVersion: latestVersion,
      branchName,
      cwd,
      isDryRun: DRY_RUN,
      prTitle: `[Prod Dependency Bot] Bumped ${dep} from ${currentVersion} to ${latestVersion}`
    });

    if (prCreated) {
      updatedProdDeps.push(dep);
      if (orgName) {
        orgPrCount[orgName] = (orgPrCount[orgName] || 0) + 1;
      }
    }
  } catch (err) {
    console.error(`Failed updating ${dep}: ${err.message}`);
  }

  return updatedProdDeps.length >= PROD_DEPS_PR_LIMIT;
});

console.log('\nSummary:');
console.log(`Total PRs created: ${updatedProdDeps.length}`);
Object.entries(orgPrCount).forEach(([org, count]) => {
  console.log(`  ${org}: ${count} PR(s)`);
});
console.log('Done.');
