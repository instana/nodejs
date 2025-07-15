/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const { execSync } = require('child_process');
const utils = require('./utils');
const PROD_DEP_UPDATES_MODE = process.env.PROD_DEP_UPDATES_MODE === 'true';
const BRANCH = process.env.BRANCH;
const SKIP_PUSH = process.env.SKIP_PUSH === 'true';
const cwd = path.join(__dirname, '..', '..');

if (!BRANCH) throw new Error('Please set env variable "BRANCH".');

console.log(`PROD_DEP_UPDATES_MODE: ${PROD_DEP_UPDATES_MODE}`);
console.log(`BRANCH: ${BRANCH}`);
console.log(`SKIP_PUSH: ${SKIP_PUSH}`);

const updatedProdDeps = [];

const packagesDir = path.join(__dirname, '..', '..', 'packages');
const pkgPaths = utils.getPackageJsonPathsUnderPackagesDir(packagesDir);

pkgPaths.some(pkgPath => {
  const pkgJson = require(pkgPath);
  const dependencies = pkgJson.dependencies || {};

  return Object.entries(dependencies).some(([dep, currentVersionRaw]) => {
    // No need to include @instana libraries
    if (dep.startsWith('@instana')) {
      return false;
    }

    if (updatedProdDeps.length >= 5) {
      console.log('Limit of 5 production dependency PRs reached.');
      return true;
    }

    const currentVersion = currentVersionRaw.replace(/[^0-9.]/g, '');
    const latestVersion = utils.getLatestVersion({
      pkgName: dep,
      installedVersion: currentVersion,
      isBeta: false
    });

    if (!latestVersion || latestVersion === currentVersion) {
      return false;
    }

    const localBranch = `${BRANCH}-${dep.replace(/[^a-zA-Z0-9]/g, '')}`;
    console.log(`Preparing PR for ${dep} (${currentVersion} -> ${latestVersion})`);

    try {
      execSync('git checkout main', { cwd });
      execSync('npm i --no-audit', { cwd });

      try {
        execSync(`git ls-remote --exit-code --heads origin ${localBranch}`, { cwd });
        console.log(`Skipping ${dep}. Branch already exists.`);
        return false;
      } catch (_) {
        // Branch does not exist, continue
      }

      execSync(`git checkout -b ${localBranch}`, { cwd });

      const pkgDir = path.dirname(pkgPath);
      console.log(`npm i ${dep}@${latestVersion} -w ${pkgJson.name || pkgDir}`);
      execSync(`npm i ${dep}@${latestVersion} -w ${pkgJson.name || pkgDir} --no-audit`, {
        stdio: 'inherit',
        cwd
      });

      execSync("git add '*package.json' package-lock.json", { cwd });
      execSync(
        `git commit -m "build: bumped production dependency ${dep} from ${currentVersion} to ${latestVersion}"`,
        { cwd }
      );

      if (utils.hasCommits(localBranch, cwd)) {
        if (!SKIP_PUSH) {
          execSync(`git push origin ${localBranch} --no-verify`, { cwd });
          execSync(
            // eslint-disable-next-line max-len
            `gh pr create --base main --head ${localBranch} --title "[Dependency Bot] Bumped ${dep} (prod dep) from ${currentVersion} to ${latestVersion}" --body "Tada!"`,
            { cwd }
          );
        }
        updatedProdDeps.push(dep);
      } else {
        console.log(`Branch ${localBranch} has no commits.`);
      }
    } catch (err) {
      console.error(`Failed updating ${dep}: ${err.message}`);
    }

    return updatedProdDeps.length >= 5;
  });
});
