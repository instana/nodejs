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
  return Object.fromEntries(
    Object.entries(releaseList).filter(
      ([version]) =>
        !version.includes('alpha') && !version.includes('beta') && !version.includes('dev') && !version.includes('rc')
    )
  );
}

function calculateDaysDifference(date1, date2) {
  const timeDiff = Math.abs(moment(date2).diff(moment(date1), 'days'));
  return timeDiff;
}

exports.getDaysBehind = (releaseList, installedVersion, today = new Date()) => {
  const stableReleaseList = filterStableReleases(releaseList);
  const versions = Object.keys(stableReleaseList);
  const installedVersionIndex = versions.indexOf(installedVersion);

  if (installedVersionIndex === -1 || installedVersionIndex === versions.length - 1) {
    return 0;
  }

  const nextVersion = versions[installedVersionIndex + 1];
  const nextVersionDate = stableReleaseList[nextVersion];
  console.log(`Next version: ${nextVersion}`);
  console.log(`Next version date: ${nextVersionDate}`);
  console.log(`Today: ${today}`);
  return calculateDaysDifference(nextVersionDate, today);
};
