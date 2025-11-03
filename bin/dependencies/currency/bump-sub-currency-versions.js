/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const rootPath = path.join(__dirname, '..', '..', '..');
const pkgJson = require(`${rootPath}/package.json`);
const utils = require('../utils');
const devDependencies = pkgJson.devDependencies || {};

const vxDevDependencies = Object.entries(devDependencies).filter(([pkgName]) => pkgName.includes('-v'));

vxDevDependencies.forEach(([pkgName, version]) => {
  const atIndex = version.lastIndexOf('@');
  if (atIndex === -1) {
    console.warn(`Skipping ${pkgName} as its version string "${version}" is not in expected format.`);
    return;
  }

  if (pkgName.match(/-v\d+\.\d+\.\d+$/)) {
    console.warn(`Skipping ${pkgName} exact version for update`);
    return;
  }

  const cleanVersion = version.substring(atIndex + 1);
  const cleanPkgName = pkgName.replace(/-v\d+$/, '');

  console.log(`Checking latest version for ${pkgName} (installed: ${cleanVersion})`);

  const latestVersion = utils.getLatestVersion({
    pkgName: cleanPkgName,
    installedVersion: cleanVersion,
    fromInstalledMajor: true
  });

  if (latestVersion === cleanVersion) {
    console.log(`  -> already up-to-date (${cleanVersion})`);
    return;
  }

  console.log(`  -> updating to ${latestVersion}`);

  const newVersionString = `npm:${cleanPkgName}@${latestVersion}`;
  devDependencies[pkgName] = newVersionString;
});

pkgJson.devDependencies = devDependencies;

console.log('Writing updated package.json...');
fs.writeFileSync(`${rootPath}/package.json`, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf-8');

console.log('Installing updated dev dependencies...');
execSync('npm i', { cwd: rootPath });
