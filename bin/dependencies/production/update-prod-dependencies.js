/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const utils = require('../utils');
const BRANCH = process.env.BRANCH;
const SKIP_PUSH = process.env.SKIP_PUSH === 'true';
const PROD_DEPS_PR_LIMIT = process.env.PROD_DEPS_PR_LIMIT || 5;
const OTEL_UPDATE = process.env.OTEL_UPDATE === 'true';
const cwd = path.join(__dirname, '..', '..', '..');

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');

console.log(`BRANCH: ${BRANCH}`);
console.log(`SKIP_PUSH: ${SKIP_PUSH}`);
console.log(`PROD_DEPS_PR_LIMIT: ${PROD_DEPS_PR_LIMIT}`);
console.log(`OTEL_UPDATE: ${OTEL_UPDATE}`);

const updatedProdDeps = [];

const packagesDir = path.join(__dirname, '..', '..', '..', 'packages');
const pkgPaths = utils.getPackageJsonPathsUnderPackagesDir(packagesDir);

const dependencyMap = {};
pkgPaths.forEach(obj => {
  const pkgJson = require(obj.pkgJsonAbsPath);
  const deps = pkgJson.dependencies || {};
  Object.entries(deps).forEach(([dep, version]) => {
    // Exclude internal libraries
    if (dep.startsWith('@instana')) return;

    // Skip otel packages unless OTEL_UPDATE is true
    if (dep.startsWith('@opentelemetry') && !OTEL_UPDATE) return;

    if (!dependencyMap[dep]) dependencyMap[dep] = [];
    dependencyMap[dep].push({ pkgRelDir: obj.pkgRelDir, version });
  });
});

// If OTEL_UPDATE, create a single PR for all OpenTelemetry packages
if (OTEL_UPDATE) {
  const otelDeps = Object.keys(dependencyMap).filter(dep => dep.startsWith('@opentelemetry'));

  if (otelDeps.length > 0) {
    const branchName = utils.createBranchName(BRANCH, 'otel', 'update');
    utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main');

    otelDeps.forEach(dep => {
      const usageList = dependencyMap[dep];
      const currentVersion = utils.cleanVersionString(usageList[0].version);
      const latestVersion = utils.getLatestVersion({
        pkgName: dep,
        installedVersion: currentVersion,
        isBeta: false
      });

      if (!latestVersion || latestVersion === currentVersion) {
        return;
      }
      usageList.forEach(({ pkgRelDir }) => {
        console.log(`Installing ${dep}@${latestVersion} in ${pkgRelDir}`);
        utils.installPackage({
          packageName: dep,
          version: latestVersion,
          cwd,
          saveFlag: '',
          workspaceFlag: pkgRelDir
        });
      });

      utils.commitChanges({
        message: `fix: bumped ${dep} from ${currentVersion} to ${latestVersion}`,
        cwd
      });
    });

    utils.createPR({
      branchName,
      cwd,
      prTitle: '[Prod Dependency Bot] Bumped all @opentelemetry packages',
      skipPush: SKIP_PUSH
    });
  }
  return;
}

Object.entries(dependencyMap).some(([dep, usageList]) => {
  if (updatedProdDeps.length >= PROD_DEPS_PR_LIMIT) return true;

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
    if (utils.branchExists(branchName, cwd)) {
      console.log(`Skipping ${dep}. Branch ${branchName} already exists.`);
      return false;
    }

    utils.prepareGitEnvironment(branchName, cwd, BRANCH === 'main');

    usageList.forEach(({ pkgRelDir }) => {
      console.log(`Installing ${dep}@${latestVersion} in ${pkgRelDir}`);
      utils.installPackage({
        packageName: dep,
        version: latestVersion,
        cwd,
        saveFlag: '',
        workspaceFlag: pkgRelDir
      });
    });

    const prCreated = utils.commitAndCreatePR({
      packageName: dep,
      currentVersion: currentVersion,
      newVersion: latestVersion,
      branchName,
      cwd,
      skipPush: SKIP_PUSH,
      prTitle: `[Prod Dependency Bot] Bumped ${dep} from ${currentVersion} to ${latestVersion}`
    });

    if (prCreated) {
      updatedProdDeps.push(dep);
    }
  } catch (err) {
    console.error(`Failed updating ${dep}: ${err.message}`);
  }

  return updatedProdDeps.length >= PROD_DEPS_PR_LIMIT;
});
