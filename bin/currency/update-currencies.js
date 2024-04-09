/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const { execSync } = require('child_process');
const currencies = require(path.join(__dirname, '..', '..', 'currencies.json'));
const utils = require('./utils');

currencies.forEach(currency => {
  let installedVersion = utils.getRootDependencyVersion(currency.name);
  let isRootDependency = true;

  if (!installedVersion) {
    installedVersion = utils.getPackageDependencyVersion(currency.name);
    isRootDependency = false;
  }

  if (!installedVersion) {
    console.log(`Skipping ${currency.name}. Seems to be a core dependency.`);
    return;
  }

  installedVersion = installedVersion.replace(/[^0-9.]/g, '');

  const latestVersion = execSync(`npm info ${currency.name} version`).toString().trim();

  if (latestVersion === installedVersion) {
    console.log(
      `Skipping ${currency.name}. Installed version is ${installedVersion}. Latest version is ${latestVersion}`
    );
    return;
  }

  if (isRootDependency) {
    console.log(`npm i -D ${currency.name}@${latestVersion}`);
    execSync(`npm i -D ${currency.name}@${latestVersion}`, { stdio: 'inherit' });
  } else {
    const subpkg = utils.getPackageName(currency.name);
    console.log(`npm i -D ${currency.name}@${latestVersion} -w ${subpkg}`);
    execSync(`npm i -D ${currency.name}@${latestVersion} -w ${subpkg}`, { stdio: 'inherit' });
  }

  execSync('git add package.json');
  execSync('git add package-lock.json');
  execSync(`git commit -m "build: bumped ${currency.name}@${latestVersion}"`);
});
