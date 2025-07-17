/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const { execSync } = require('child_process');
const utils = require('./utils');
const BRANCH = process.env.BRANCH;
const SKIP_PUSH = process.env.SKIP_PUSH === 'true';
const MAX_PROD_PR_LIMIT = process.env.MAX_PROD_PR_LIMIT || 5;
const cwd = path.join(__dirname, '..', '..');

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');

console.log(`BRANCH: ${BRANCH}`);
console.log(`SKIP_PUSH: ${SKIP_PUSH}`);
console.log(`MAX_PROD_PR_LIMIT: ${MAX_PROD_PR_LIMIT}`);

const updatedProdDeps = [];

const packagesDir = path.join(__dirname, '..', '..', 'packages');
const pkgPaths = utils.getPackageJsonPathsUnderPackagesDir(packagesDir);

const dependencyMap = {};
pkgPaths.forEach(pkgPath => {
  const pkgJson = require(pkgPath);
  const deps = pkgJson.dependencies || {};
  Object.entries(deps).forEach(([dep, version]) => {
    // Exclude internal libraries
    if (dep.startsWith('@instana')) return;
    if (!dependencyMap[dep]) dependencyMap[dep] = [];
    dependencyMap[dep].push({ pkgPath, version });
  });
});

Object.entries(dependencyMap).some(([dep, usageList]) => {
  if (updatedProdDeps.length >= MAX_PROD_PR_LIMIT) return true;

  const currentVersion = usageList[0].version.replace(/[^0-9.]/g, '');
  const latestVersion = utils.getLatestVersion({
    pkgName: dep,
    installedVersion: currentVersion,
    isBeta: false
  });

  if (!latestVersion || latestVersion === currentVersion) return false;

  const branchName = `${BRANCH}-${dep.replace(/[^a-zA-Z0-9]/g, '')}-${latestVersion.replace(/\./g, '')}`;

  console.log(`Preparing PR for ${dep} (${currentVersion} -> ${latestVersion})`);

  try {
    execSync('git checkout main', { cwd });
    execSync('npm i --no-audit', { cwd });

    try {
      execSync(`git ls-remote --exit-code --heads origin ${branchName}`, { cwd });
      console.log(`Skipping ${dep}. Branch already exists.`);
      return;
    } catch (_) {
      // ignore err
      // CASE: branch does not exist, continue
    }

    if (BRANCH !== 'main') {
      execSync(`git checkout -b ${branchName}`, { cwd });
    }

    usageList.forEach(({ pkgPath }) => {
      const pkgJson = require(pkgPath);
      const pkgDir = path.dirname(pkgPath);
      const targetName = pkgJson.name || pkgDir;
      console.log(`npm i ${dep}@${latestVersion} -w ${targetName}`);
      execSync(`npm i ${dep}@${latestVersion} -w ${targetName} --no-audit`, {
        stdio: 'inherit',
        cwd
      });
    });

    execSync("git add '*package.json' package-lock.json", { cwd });
    execSync(`git commit -m "build: bumped ${dep} from ${currentVersion} to ${latestVersion}"`, { cwd });

    if (utils.hasCommits(branchName, cwd)) {
      if (!SKIP_PUSH) {
        execSync(`git push origin ${branchName} --no-verify`, { cwd });
        execSync(
          // eslint-disable-next-line max-len
          `gh pr create --base main --head ${branchName} --title "[Prod Dependency Bot] Bumped ${dep} from ${currentVersion} to ${latestVersion}" --body "Tada!"`,
          { cwd }
        );

        updatedProdDeps.push(dep);
      }
    } else {
      console.log(`Branch ${branchName} has no commits.`);
    }
  } catch (err) {
    console.error(`Failed updating ${dep}: ${err.message}`);
  }

  return updatedProdDeps.length >= MAX_PROD_PR_LIMIT;
});
