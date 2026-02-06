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

/**
 * Returns ALL directories under baseDir whose name matches name or normalizedName.
 */
function findTestDirectories(baseDir, name, normalizedName) {
  const results = [];

  function search(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;

      if (entry.name === name || entry.name === normalizedName) {
        results.push(path.join(dir, entry.name));
      } else {
        search(path.join(dir, entry.name));
      }
    }
  }

  search(baseDir);
  return results;
}

/**
 * Returns directories that have test_base.js + package.json.template but were not processed as currencies.
 */
function findNonCurrencyTestDirs(baseDir, processedDirs) {
  const results = [];

  function search(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    const hasTestBase = entries.some(e => e.isFile() && e.name === 'test_base.js');
    const hasTemplate = entries.some(e => e.isFile() && e.name === 'package.json.template');

    if (hasTestBase && hasTemplate && !processedDirs.has(dir)) {
      results.push(dir);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('_v')) {
        search(path.join(dir, entry.name));
      }
    }
  }

  search(baseDir);
  return results;
}

function cleanVersionDirs(testDir) {
  const versionDirs = fs.readdirSync(testDir).filter(name => name.startsWith('_v'));
  versionDirs.forEach(dir => {
    const dirPath = path.join(testDir, dir);
    console.log(`Deleting ${dirPath}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  });
}

function generateTestWrapper({ suiteName, displayVersion, rawVersion, isLatest, esmOnly, mode }) {
  const currentYear = new Date().getFullYear();

  return `/*
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

${esmOnly ? `if (!process.env.RUN_ESM) {
  console.log('Skipping ${suiteName}@${displayVersion} because it is ESM-only. Set RUN_ESM=true to run.');
  return;
}

` : ''}mochaSuiteFn('tracing/${suiteName}@${displayVersion}${mode ? ` (${mode})` : ''}', function () {
  this.timeout(config.getTestTimeout());

  before(() => {
    execSync('rm -rf node_modules', { cwd: __dirname, stdio: 'inherit' });
    execSync('npm install --no-audit --prefix ./', { cwd: __dirname, stdio: 'inherit' });
  });

  testBase.call(this, '${suiteName}', '${rawVersion}', ${isLatest}${mode ? `, '${mode}'` : ''});
});
`;
}

function generatePackageJson({ testDir, versionDir, pkgName, currencyName, currencyVersion, isOptional }) {
  const packageJsonTemplatePath = path.join(testDir, 'package.json.template');
  const packageJsonPath = path.join(testDir, 'package.json');
  let versionPackageJson = { name: pkgName };

  if (fs.existsSync(packageJsonTemplatePath)) {
    const templatePackageJson = JSON.parse(fs.readFileSync(packageJsonTemplatePath, 'utf8'));
    versionPackageJson = Object.assign(versionPackageJson, templatePackageJson);
  } else if (fs.existsSync(packageJsonPath)) {
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

  if (currencyName && currencyVersion) {
    if (isOptional) {
      if (!versionPackageJson.optionalDependencies) {
        versionPackageJson.optionalDependencies = {};
      }
      versionPackageJson.optionalDependencies[currencyName] = currencyVersion;
    } else {
      versionPackageJson.dependencies[currencyName] = currencyVersion;
    }
  }

  fs.writeFileSync(path.join(versionDir, 'package.json'), `${JSON.stringify(versionPackageJson, null, 2)}\n`);
}

function main() {
  const currencies = JSON.parse(fs.readFileSync(currenciesPath, 'utf8'));
  const processedDirs = new Set();

  // Pass 1: Currency test directories
  currencies.forEach(currency => {
    if (!currency.versions || currency.versions.length === 0) return;

    const normalizedName = currency.name.replace(/^@/, '').replace(/\//g, '_');
    const testDirs = findTestDirectories(collectorTestDir, currency.name, normalizedName);

    testDirs.forEach(testDir => {
      console.log(`Found test directory: ${testDir}`);
      processedDirs.add(testDir);

      const testBasePath = path.join(testDir, 'test_base.js');
      if (!fs.existsSync(testBasePath)) {
        console.log(`test_base.js not found in ${testDir}, skipping generation...`);
        return;
      }

      const sortedVersions = currency.versions.map(v => (typeof v === 'string' ? v : v.v)).sort(semver.rcompare);
      const latestVersion = sortedVersions[0];

      cleanVersionDirs(testDir);

      const versionToDir = new Map();
      sortedVersions.forEach(v => {
        versionToDir.set(v, `_v${v}`);
      });

      currency.versions.forEach(versionObj => {
        const version = typeof versionObj === 'string' ? versionObj : versionObj.v;
        const isLatest = version === latestVersion;
        const esmOnly = typeof versionObj === 'object' && versionObj.esmOnly === true;
        const majorVersion = semver.major(version);

        const dirName = versionToDir.get(version);
        if (!dirName) return;

        const versionDir = path.join(testDir, dirName);
        if (!fs.existsSync(versionDir)) {
          fs.mkdirSync(versionDir, { recursive: true });
        }

        // Generate test.js (with modes support)
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
          const testContent = generateTestWrapper({
            suiteName: currency.name,
            displayVersion: dirName.substring(1),
            rawVersion: version,
            isLatest,
            esmOnly,
            mode
          });
          const fileName = mode ? `test_${mode}.js` : 'test.js';
          fs.writeFileSync(path.join(versionDir, fileName), testContent);
        });

        // Generate package.json
        const matchingVersion = currency.versions.find(vObj => {
          const v = typeof vObj === 'string' ? vObj : vObj.v;
          const parsed = semver.parse(v);
          return parsed && parsed.major === majorVersion;
        });
        const actualVersion = matchingVersion
          ? (typeof matchingVersion === 'string' ? matchingVersion : matchingVersion.v)
          : null;
        const isOptional = typeof matchingVersion === 'object' && matchingVersion.optional === true;

        generatePackageJson({
          testDir,
          versionDir,
          pkgName: `${currency.name}-v${majorVersion}`,
          currencyName: currency.name,
          currencyVersion: actualVersion,
          isOptional
        });

        symlinkContents(testDir, versionDir);
      });
    });
  });

  // Pass 2: Non-currency test directories (test_base.js + package.json.template)
  const nonCurrencyDirs = findNonCurrencyTestDirs(collectorTestDir, processedDirs);

  nonCurrencyDirs.forEach(testDir => {
    const dirName = path.basename(testDir);
    console.log(`Found non-currency test directory: ${testDir}`);

    cleanVersionDirs(testDir);

    const version = '1.0.0';
    const versionDir = path.join(testDir, `_v${version}`);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const testContent = generateTestWrapper({
      suiteName: dirName,
      displayVersion: version,
      rawVersion: version,
      isLatest: true,
      esmOnly: false,
      mode: null
    });
    fs.writeFileSync(path.join(versionDir, 'test.js'), testContent);

    generatePackageJson({
      testDir,
      versionDir,
      pkgName: `${dirName}-v1`,
      currencyName: null,
      currencyVersion: null,
      isOptional: false
    });

    symlinkContents(testDir, versionDir);
  });
}

main();
