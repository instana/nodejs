#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const rootDir = path.resolve(__dirname, '..');
const currenciesPath = path.join(rootDir, 'currencies.json');
const collectorTestDir = path.join(rootDir, 'packages', 'collector', 'test');

function main() {
  const currencies = JSON.parse(fs.readFileSync(currenciesPath, 'utf8'));

  currencies.forEach(currency => {
    if (!currency.versions || currency.versions.length === 0) {
      return;
    }

    function findTestDirectory(dir) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        return null;
      }

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') {
            return null;
          }
          if (entry.name === currency.name) {
            return path.join(dir, entry.name);
          }

          const found = findTestDirectory(path.join(dir, entry.name));
          if (found) {
            return found;
          }
        }
      }
      return null;
    }

    const testDir = findTestDirectory(collectorTestDir);
    if (!testDir) {
      console.log(`Test directory not found for ${currency.name}, skipping...`);
      return;
    }

    console.log(`Found test directory: ${testDir}`);

    const testBasePath = path.join(testDir, 'test_base.js');
    if (!fs.existsSync(testBasePath)) {
      console.log(`test_base.js not found in ${testDir}, skipping generation...`);
      return;
    }

    const sortedVersions = currency.versions.map(v => (typeof v === 'string' ? v : v.v)).sort(semver.rcompare);
    const latestVersion = sortedVersions[0];

    currency.versions.forEach(versionObj => {
      const version = typeof versionObj === 'string' ? versionObj : versionObj.v;
      const isLatest = version === latestVersion;
      const majorVersion = semver.major(version);
      const versionDir = path.join(testDir, `_v${majorVersion}`);

      if (!fs.existsSync(versionDir)) {
        fs.mkdirSync(versionDir, { recursive: true });
      }

      const currentYear = new Date().getFullYear();

      const testContent = `/*
 * (c) Copyright IBM Corp. ${currentYear}
 */

'use strict';

/** THIS IS A GENERATED FILE. DO NOT MODIFY IT. */

const { execSync } = require('child_process');
const path = require('path');
const testBase = require('./test_base');
const config = require('@_instana/core/test/config');

describe('tracing/${currency.name}@v${majorVersion}', function () {
  this.timeout(config.getTestTimeout());

  before(() => {
    execSync('rm -rf node_modules', { cwd: __dirname, stdio: 'inherit' });
    execSync('npm install --no-audit --prefix ./', { cwd: __dirname, stdio: 'inherit' });
  });

  testBase.call(this, '${currency.name}', '${version}', ${isLatest});
});
`;
      fs.writeFileSync(path.join(versionDir, 'test.js'), testContent);

      const packageJsonPath = path.join(testDir, 'package.json');
      let versionPackageJson = {
        name: `${currency.name}-v${majorVersion}`
      };

      if (fs.existsSync(packageJsonPath)) {
        const templatePackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        versionPackageJson = Object.assign(versionPackageJson, templatePackageJson);
      }

      if (!versionPackageJson.dependencies) {
        versionPackageJson.dependencies = {};
      }

      const tgzDir = path.join(collectorTestDir, 'instana-tgz');
      const relativeTgzPath = path.relative(versionDir, tgzDir).replace(/\\/g, '/');

      versionPackageJson.dependencies['@instana/collector'] = `file:${relativeTgzPath}/collector.tgz`;
      versionPackageJson.dependencies['@instana/core'] = `file:${relativeTgzPath}/core.tgz`;
      versionPackageJson.dependencies['@instana/shared-metrics'] = `file:${relativeTgzPath}/shared-metrics.tgz`;

      const matchingVersion = currency.versions.find(vObj => {
        const v = typeof vObj === 'string' ? vObj : vObj.v;
        const parsed = semver.parse(v);
        return parsed && parsed.major === majorVersion;
      });
      if (matchingVersion) {
        const actualVersion = typeof matchingVersion === 'string' ? matchingVersion : matchingVersion.v;
        versionPackageJson.dependencies[currency.name] = actualVersion;
      }

      fs.writeFileSync(path.join(versionDir, 'package.json'), `${JSON.stringify(versionPackageJson, null, 2)}\n`);

      let appJsName = 'app.js';
      let appJsPath = path.join(testDir, appJsName);

      if (!fs.existsSync(appJsPath)) {
        const files = fs.readdirSync(testDir);
        const customAppJs = files.find(f => f.endsWith('.js') && f !== 'test_base.js' && f !== 'package.json');

        if (customAppJs) {
          appJsName = customAppJs;
          appJsPath = path.join(testDir, appJsName);
        }
      }

      if (fs.existsSync(appJsPath)) {
        const symlinkPath = path.join(versionDir, appJsName);
        if (fs.existsSync(symlinkPath)) {
          fs.unlinkSync(symlinkPath);
        }
        fs.symlinkSync(path.relative(versionDir, appJsPath), symlinkPath);
      }

      let appMjsName = 'app.mjs';
      let appMjsPath = path.join(testDir, appMjsName);

      if (!fs.existsSync(appMjsPath)) {
        const files = fs.readdirSync(testDir);
        const customAppMjs = files.find(f => f.endsWith('.mjs') && f !== 'test_base.mjs');

        if (customAppMjs) {
          appMjsName = customAppMjs;
          appMjsPath = path.join(testDir, appMjsName);
        }
      }

      if (fs.existsSync(appMjsPath)) {
        const symlinkPath = path.join(versionDir, appMjsName);
        if (fs.existsSync(symlinkPath)) {
          fs.unlinkSync(symlinkPath);
        }
        fs.symlinkSync(path.relative(versionDir, appMjsPath), symlinkPath);
      }

      const testBasePath = path.join(testDir, 'test_base.js');
      if (fs.existsSync(testBasePath)) {
        const symlinkPath = path.join(versionDir, 'test_base.js');
        if (fs.existsSync(symlinkPath)) {
          fs.unlinkSync(symlinkPath);
        }
        fs.symlinkSync(path.relative(versionDir, testBasePath), symlinkPath);
      }
    });
  });
}

main();
