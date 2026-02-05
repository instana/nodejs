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

    function createSymlink(sourcePath, targetPath) {
      if (fs.existsSync(targetPath)) {
        if (fs.lstatSync(targetPath).isDirectory() || !fs.lstatSync(targetPath).isSymbolicLink()) {
          return;
        }
        fs.unlinkSync(targetPath);
      }
      fs.symlinkSync(path.relative(path.dirname(targetPath), sourcePath), targetPath);
    }

    function symlinkContents(sourceDir, targetDir) {
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('_v')) {
          continue;
        }

        const sourceEntryPath = path.join(sourceDir, entry.name);
        const targetEntryPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
          if (!fs.existsSync(targetEntryPath)) {
            fs.mkdirSync(targetEntryPath);
          }
          symlinkContents(sourceEntryPath, targetEntryPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (ext === '.js' || ext === '.mjs') {
            createSymlink(sourceEntryPath, targetEntryPath);
          }
        }
      }
    }

    const testDir = findTestDirectory(collectorTestDir);
    if (!testDir) {
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


    const usedDirs = new Set();
    const versionToDir = new Map();

    sortedVersions.forEach(v => {
      const versionStr = typeof v === 'string' ? v : v.v;
      const major = semver.major(versionStr);
      const minor = semver.minor(versionStr);
      const patch = semver.patch(versionStr);

      let versionDirName = `_v${major}`;

      if (usedDirs.has(versionDirName)) {
        versionDirName = `_v${major}.${minor}`;
      }

      if (usedDirs.has(versionDirName)) {
        versionDirName = `_v${major}.${minor}.${patch}`;
      }

      if (usedDirs.has(versionDirName)) {
        console.warn(`Could not find a unique directory name for version ${versionStr} of ${currency.name}. Skipping.`);
        return;
      }

      usedDirs.add(versionDirName);
      versionToDir.set(versionStr, versionDirName);
    });

    currency.versions.forEach(versionObj => {
      const version = typeof versionObj === 'string' ? versionObj : versionObj.v;
      const isLatest = version === latestVersion;
      const majorVersion = semver.major(version);

      const dirName = versionToDir.get(version);
      if (!dirName) {
        return;
      }

      const versionDir = path.join(testDir, dirName);

      if (!fs.existsSync(versionDir)) {
        fs.mkdirSync(versionDir, { recursive: true });
      }

      const modesPath = path.join(testDir, 'modes.json');
      let modes = [null];
      if (fs.existsSync(modesPath)) {
        try {
          modes = JSON.parse(fs.readFileSync(modesPath, 'utf8'));
        } catch (err) {
          console.error(`Failed to parse ${modesPath}:`, err);
        }
      }

      modes.forEach(mode => {
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
const supportedVersion = require('@_instana/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/${currency.name}@${dirName.substring(1)}${mode ? ` (${mode})` : ''}', function () {
  this.timeout(config.getTestTimeout());

  before(() => {
    execSync('rm -rf node_modules', { cwd: __dirname, stdio: 'inherit' });
    execSync('npm install --no-audit --prefix ./', { cwd: __dirname, stdio: 'inherit' });
  });

  testBase.call(this, '${currency.name}', '${version}', ${isLatest}${mode ? `, '${mode}'` : ''});
});
`;
        const fileName = mode ? `test_${mode}.js` : 'test.js';
        fs.writeFileSync(path.join(versionDir, fileName), testContent);
      });

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

      symlinkContents(testDir, versionDir);
    });
  });
}

main();
