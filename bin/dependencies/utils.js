/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
// eslint-disable-next-line import/no-extraneous-dependencies
const semver = require('semver');
// eslint-disable-next-line import/no-extraneous-dependencies
const moment = require('moment');

const { execSync } = require('child_process');
const fs = require('fs');

exports.getRootDependencyVersion = name => {
  const pkgjson = require(path.join(__dirname, '..', '..', 'package.json'));
  return pkgjson.devDependencies[name] || pkgjson.optionalDependencies[name];
};

exports.getDevDependencyVersion = name => {
  const pkgjson = require(path.join(__dirname, '..', '..', 'package.json'));
  return pkgjson.devDependencies[name];
};

exports.getOptionalDependencyVersion = name => {
  const pkgjson = require(path.join(__dirname, '..', '..', 'package.json'));
  return pkgjson.optionalDependencies[name];
};

exports.getPackageName = name => {
  const dirs = fs.readdirSync(path.join(__dirname, '..', '..', 'packages'));
  let targetPkg;

  dirs.forEach(dir => {
    try {
      const subpkgjson = require(path.join(__dirname, '..', '..', 'packages', dir, 'package.json'));
      if (subpkgjson.devDependencies?.[name] || subpkgjson.optionalDependencies?.[name]) {
        targetPkg = `packages/${dir}`;
      }
    } catch (error) {
      return undefined;
    }
  });

  return targetPkg;
};

exports.getPackageDependencyVersion = name => {
  const dirs = fs.readdirSync(path.join(__dirname, '..', '..', 'packages'));

  return dirs
    .map(dir => {
      try {
        const subpkgjson = require(path.join(__dirname, '..', '..', 'packages', dir, 'package.json'));
        return subpkgjson.devDependencies?.[name] || subpkgjson.optionalDependencies?.[name];
      } catch (error) {
        return undefined;
      }
    })
    .find(version => version !== undefined);
};

const hasPrereleaseTag = (packageName, majorVersion) => {
  const tags = JSON.parse(execSync(`npm view ${packageName} dist-tags --json`).toString());
  let toReturn = false;

  Object.keys(tags).forEach(tag => {
    if (tag !== 'latest' && semver.major(tags[tag]) === majorVersion) {
      toReturn = true;
    }
  });

  return toReturn;
};

const getAllVersions = packageName => {
  return JSON.parse(execSync(`npm view ${packageName} versions --json`).toString());
};

const getHighestMajorVersion = versions => {
  let highestMajorVersion;

  versions.forEach(version => {
    if (
      !highestMajorVersion ||
      (semver.major(version) >= semver.major(highestMajorVersion) && semver.gt(version, highestMajorVersion))
    ) {
      highestMajorVersion = version;
    }
  });

  return highestMajorVersion;
};

exports.getLatestVersion = ({ pkgName, installedVersion, isBeta }) => {
  let latestVersion = execSync(`npm info ${pkgName} version`).toString().trim();
  const allVersions = getAllVersions(pkgName);
  const highestMajorVersion = getHighestMajorVersion(allVersions);

  if (semver.major(highestMajorVersion) > semver.major(latestVersion)) {
    const highestMajorVersionIsPrerelease =
      hasPrereleaseTag(pkgName, semver.major(highestMajorVersion)) || semver.prerelease(highestMajorVersion);

    console.log(
      // eslint-disable-next-line max-len
      `Detected a higher major version: ${highestMajorVersion} and this version is a prerelease: ${!!highestMajorVersionIsPrerelease}`
    );

    // If isBeta is true, then we allow prerelease version as latest in currency report
    if (!highestMajorVersionIsPrerelease || isBeta) {
      latestVersion = highestMajorVersion;
    }
  }

  // e.g. kafka-avro released a wrong order of versions
  if (installedVersion && semver.lt(latestVersion, installedVersion)) {
    return installedVersion;
  }

  return latestVersion;
};

function filterStableReleases(releaseList) {
  const unstableReleaseKeyWords = ['alpha', 'beta', 'canary', 'dev', 'experimental', 'next', 'rc', 'integration'];

  return Object.fromEntries(
    Object.entries(releaseList).filter(
      ([version]) => !unstableReleaseKeyWords.some(keyword => version.includes(keyword))
    )
  );
}

function calculateDaysDifference(date1, date2) {
  const timeDiff = Math.abs(moment(date2).diff(moment(date1), 'days'));
  return timeDiff;
}

const getNextVersion = (versions, installedVersionIndex, installedVersion) => {
  const nextIndex = installedVersionIndex + 1;
  const nextVersion = versions[nextIndex];

  // CASE: Check if the next version is invalid based on two conditions:
  // 1. The next version is from an older major version.
  // 2. The next version has the same major version but is lower than the installed version.
  if (
    nextVersion &&
    (semver.major(installedVersion) > semver.major(nextVersion) ||
      (semver.major(installedVersion) === semver.major(nextVersion) && semver.lt(nextVersion, installedVersion)))
  ) {
    return getNextVersion(versions, nextIndex, installedVersion);
  }

  return nextVersion;
};

exports.getDaysBehind = (releaseList, installedVersion, today = new Date()) => {
  const stableReleaseList = filterStableReleases(releaseList);
  const versions = Object.keys(stableReleaseList);
  const installedVersionIndex = versions.indexOf(installedVersion);

  // CASE: the installed version is the latest release or the installed version is a prerelease
  if (installedVersionIndex === -1 || installedVersionIndex === versions.length - 1) {
    return 0;
  }

  // Step 1: Get the "next" version release date, because the days behind is the number between
  //         the next release AFTER our installed version and TODAY
  const nextVersion = getNextVersion(versions, installedVersionIndex, installedVersion);
  const nextVersionDate = stableReleaseList[nextVersion];

  console.log(`From: ${nextVersionDate}`);
  console.log(`To: ${today}`);

  // Step 2: Calculate the days
  return calculateDaysDifference(nextVersionDate, today);
};

exports.hasCommits = (branch, cwd) => {
  try {
    const result = execSync(`git log main..${branch} --pretty=format:"%h"`, { cwd }).toString().trim();
    console.log(`Commits in branch '${branch}' not in 'main':\n${result}`);
    return result && result.length > 0;
  } catch (err) {
    return false;
  }
};

exports.getPackageJsonPathsUnderPackagesDir = packagesDir => {
  const results = [];

  if (!fs.existsSync(packagesDir)) {
    console.warn(`Directory not found: ${packagesDir}`);
    return results;
  }

  const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  entries.forEach(entry => {
    if (entry.isDirectory()) {
      const pkgJsonPath = path.join(packagesDir, entry.name, 'package.json');

      if (fs.existsSync(pkgJsonPath)) {
        results.push({
          pkgRelDir: `packages/${entry.name}`,
          pkgJsonAbsPath: pkgJsonPath
        });
      }
    }
  });

  return results;
};

/**
 * Creates a standardized branch name for dependency updates
 * @param {string} baseBranch - The base branch name
 * @param {string} packageName - The package name being updated
 * @param {string} version - The new version to update to
 * @returns {string} Formatted branch name
 */
exports.createBranchName = (baseBranch, packageName, version) => {
  return `${baseBranch}-${packageName.replace(/[^a-zA-Z0-9]/g, '')}-${version.replace(/\./g, '')}`;
};

/**
 * Checks if a branch already exists in the remote repository
 * @param {string} branchName - The branch name to check
 * @param {string} cwd - Current working directory
 * @returns {boolean} True if branch exists, false otherwise
 */
exports.branchExists = (branchName, cwd) => {
  try {
    execSync(`git ls-remote --exit-code --heads origin ${branchName}`, { cwd });
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Prepares the git environment for dependency updates
 * @param {string} branchName - The branch name to checkout or create
 * @param {string} cwd - Current working directory
 * @param {boolean} isMainBranch - Whether the current branch is 'main'
 */
exports.prepareGitEnvironment = (branchName, cwd, isMainBranch) => {
  execSync('git checkout main', { cwd });
  execSync('npm i --no-audit', { cwd });

  if (!isMainBranch) {
    execSync(`git checkout -b ${branchName}`, { cwd });
  }
};

/**
 * Commits changes and creates a PR for dependency updates
 * @param {Object} options - Options object
 * @param {string} options.packageName - package name being updated
 * @param {string} options.currentVersion - current version
 * @param {string} options.newVersion - new version to update to
 * @param {string} options.branchName - branch name
 * @param {string} options.cwd - current working directory
 * @param {boolean} options.skipPush - whether to skip pushing to remote
 * @param {string} options.prTitle - custom PR title
 * @returns {boolean} True if PR was created, false otherwise
 */
exports.commitAndCreatePR = options => {
  const { packageName, currentVersion, newVersion, branchName, cwd, skipPush, prTitle } = options;

  execSync("git add '*package.json' package-lock.json", { cwd });
  execSync(`git commit -m "build: bumped ${packageName} from ${currentVersion} to ${newVersion}"`, { cwd });

  if (exports.hasCommits(branchName, cwd)) {
    if (!skipPush) {
      execSync(`git push origin ${branchName} --no-verify`, { cwd });
      execSync(`gh pr create --base main --head ${branchName} --title "${prTitle}" --body "Tada!"`, { cwd });
      console.log(`Pushed the branch: ${branchName} and raised PR`);
      return true;
    }
  } else {
    console.log(`Branch ${branchName} has no commits.`);
  }
  return false;
};

exports.isExactVersion = ({ workspaceFlag, packageName, cwd, saveFlag }) => {
  const pkgJsonPath = path.join(cwd, workspaceFlag ? path.join(workspaceFlag, 'package.json') : 'package.json');
  const pkgJson = require(pkgJsonPath);
  const isDev = saveFlag === '--save-dev';
  const isOptional = saveFlag === '--save-optional';

  let pkg;
  if (isDev) {
    pkg = pkgJson.devDependencies[packageName];
  } else if (isOptional) {
    pkg = pkgJson.optionalDependencies[packageName];
  } else {
    pkg = pkgJson.dependencies[packageName];
  }

  return pkg && !pkg.startsWith('~') && !pkg.startsWith('^');
};

/**
 * Installs a package with the specified version
 * @param {Object} options - Options object
 * @param {string} options.packageName - The package name to install
 * @param {string} options.version - The version to install
 * @param {string} options.cwd - Current working directory
 * @param {string} options.saveFlag - The save flag (--save-dev, --save-optional, etc.)
 * @param {string} options.workspaceFlag - Optional workspace flag (-w packageName)
 * @param {Function} options.execSyncFn - Optional custom execSync function
 */
exports.installPackage = options => {
  const { packageName, version, cwd, saveFlag, workspaceFlag, execSyncFn } = options;

  const workspaceOption = workspaceFlag ? `-w ${workspaceFlag}` : '';
  let command = `npm i ${saveFlag} ${packageName}@${version} ${workspaceOption} --no-audit`;

  const isExactVersion = exports.isExactVersion({ workspaceFlag, packageName, cwd, saveFlag });
  const execFn = execSyncFn || execSync;

  if (isExactVersion) {
    command += ' --save-exact';
  }

  console.log(command);
  execFn(command, { stdio: 'inherit', cwd });

  // For optional dependencies, run an extra npm install due to npm bug
  if (saveFlag === '--save-optional') {
    execFn('npm i', { stdio: 'inherit', cwd });
  }
};

/**
 * Cleans a version string by removing non-numeric characters except dots
 * @param {string} version - The version string to clean
 * @returns {string} Cleaned version string
 */
exports.cleanVersionString = version => {
  return version.replace(/[^0-9.]/g, '');
};
