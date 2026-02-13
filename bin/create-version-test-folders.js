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

/**
 * Returns ALL directories under baseDir whose name matches the currency name.
 * Supports scoped packages: @scope/pkg is matched as a @scope directory containing a pkg subdirectory.
 */
function findTestDirectories(baseDir, name) {
  const results = [];
  const scopeMatch = name.match(/^(@[^/]+)\/(.+)$/);

  function search(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    entries
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
      .forEach(entry => {
        if (scopeMatch && entry.name === scopeMatch[1]) {
          const pkgDir = path.join(dir, entry.name, scopeMatch[2]);
          if (fs.existsSync(pkgDir) && fs.statSync(pkgDir).isDirectory()) {
            results.push(pkgDir);
          }
        } else if (!scopeMatch && entry.name === name) {
          results.push(path.join(dir, entry.name));
        } else {
          search(path.join(dir, entry.name));
        }
      });
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

    if (hasTestBase && !processedDirs.has(dir)) {
      results.push(dir);
    }

    entries
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('_v'))
      .forEach(entry => {
        search(path.join(dir, entry.name));
      });
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

function generateTestWrapper({
  suiteName,
  displayVersion,
  rawVersion,
  isLatest,
  esmOnly,
  mode,
  sourceDepth,
  nodeConstraint,
  isOptional
}) {
  const currentYear = new Date().getFullYear();
  const relSourcePath = sourceDepth === 2 ? '../..' : '..';

  return `/*
 * (c) Copyright IBM Corp. ${currentYear}
 */

'use strict';

/** THIS IS A GENERATED FILE. DO NOT MODIFY IT. */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('@_local/core/test/config');
const installSemaphore = require('@_local/core/test/test_util/install-semaphore');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

function copyParentFiles(dir, sourceDir) {
  const copied = [];
  fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter(e =>
      !e.name.startsWith('_v') &&
      e.name !== 'node_modules' &&
      e.name !== 'package.json' &&
      e.name !== 'package.json.template' &&
      e.name !== 'modes.json'
    )
    .forEach(e => {
      const src = path.join(sourceDir, e.name);
      const dest = path.join(dir, e.name);
      if (e.isFile()) {
        fs.copyFileSync(src, dest);
        copied.push(dest);
      } else if (e.isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
        copied.push(dest);
      }
    });
  return copied;
}

function rmDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
  } catch (err) {
    if (process.platform !== 'win32') {
      try {
        execSync(\`rm -rf \${dirPath}\`, { stdio: 'ignore' });
      } catch (e) {
        // ignore
      }
    }
  }
}

function cleanupCopiedFiles(files) {
  files.forEach(f => {
    rmDir(f);
  });
}

${esmOnly
      ? `if (!process.env.RUN_ESM) {
  it.skip('tracing/${suiteName}@${displayVersion} (ESM-only, set RUN_ESM=true)');
  return;
}

`
      : ''
    }${nodeConstraint
      ? `// eslint-disable-next-line global-require
if (!require('semver').satisfies(process.versions.node, '${nodeConstraint}')) {
  it.skip('tracing/${suiteName}@${displayVersion} skipped (requires node ${nodeConstraint})');
  return;
}

`
      : ''
    }function log(msg) { console.log(\`[\${new Date().toISOString()}] \${msg}\`); }

const esmPrefix = process.env.RUN_ESM ? '[ESM] ' : '';
const ts = new Date().toISOString();
const suiteTitle = esmPrefix + \`[\${ts}] tracing/${suiteName}@${displayVersion}${mode ? ` (${mode})` : ''}\`;
mochaSuiteFn(suiteTitle, function () {
  this.timeout(config.getTestTimeout());
  rmDir(path.join(__dirname, 'node_modules'));
  const copiedFiles = copyParentFiles(__dirname, path.resolve(__dirname, '${relSourcePath}'));
  const cleanup = () => cleanupCopiedFiles(copiedFiles);
  after(() => cleanup());
  process.once('exit', cleanup);
  process.once('SIGINT', () => { cleanup(); process.exit(130); });
  process.once('SIGTERM', () => { cleanup(); process.exit(143); });

  before(async function () {
    const installTimeout = config.getNPMInstallTimeout();
    const maxRetries = 3;
    const semaphoreWait = process.env.CI ? 10 * 60 * 1000 : 0;
    this.timeout(8 * 60 * 1000 + semaphoreWait);

    log('[INFO] Setting up dependencies for ${suiteName}@${displayVersion}...');
    const slot = process.env.CI ? await installSemaphore.acquireSlot(log) : undefined;
    if (slot !== undefined) log(\`[INFO] Acquired install slot \${slot}\`);
    try {
      rmDir(path.join(__dirname, 'node_modules'));

      // eslint-disable-next-line global-require,import/no-dynamic-require
      const preinstalledMod = require('@_local/collector/test/test_util/preinstalled-node-modules');
      preinstalledMod.extractPreinstalledPackages(__dirname, { timeout: installTimeout - 1000 });

      log('[INFO] Running npm install for ${suiteName}@${displayVersion}...');
      const npmCmd = 'npm install --no-package-lock --no-audit --prefix ./ --no-progress';
      for (let attempt = 0; attempt < maxRetries; attempt++) {${isOptional
      ? `
        const timeout = 180 * 1000;`
      : `
        const timeout = (60 + attempt * 30) * 1000;`
    }
        try {
          execSync(npmCmd, { cwd: __dirname, stdio: 'inherit', timeout });${isOptional
      ? `
          if (!fs.existsSync(path.join(__dirname, 'node_modules', '${suiteName}'))) {
            throw new Error('${suiteName} not found after install');
          }`
      : ''
    }
          break;
        } catch (err) {
          if (attempt === maxRetries - 1) throw err;
          const secs = timeout / 1000;
          log(\`[WARN] npm install failed (\${err.message}), retry \${attempt + 1}/\${maxRetries} (\${secs}s)...\`);
          rmDir(path.join(__dirname, 'node_modules'));
        }
      }
    } finally {
      if (slot !== undefined) installSemaphore.releaseSlot(slot);
    }

    log('[INFO] Done setting up dependencies for ${suiteName}@${displayVersion}');
  });

  // eslint-disable-next-line global-require,import/no-dynamic-require,import/extensions
  const testBase = require('./test_base');
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

    const testDirs = findTestDirectories(collectorTestDir, currency.name);

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

        const hasModes = modes.length > 1 || (modes.length === 1 && modes[0] !== null);
        const isOptional = typeof versionObj === 'object' && versionObj.optional === true;
        const nodeConstraint = typeof versionObj === 'object' ? versionObj.node || '' : '';

        modes.forEach(mode => {
          // When modes exist, each mode gets its own subdirectory for isolation
          const targetDir = hasModes ? path.join(versionDir, mode) : versionDir;
          if (hasModes && !fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          const testContent = generateTestWrapper({
            suiteName: currency.name,
            displayVersion: dirName.substring(1),
            rawVersion: version,
            isLatest,
            esmOnly,
            mode,
            sourceDepth: hasModes ? 2 : 1,
            nodeConstraint,
            isOptional
          });
          const fileName = mode ? `${mode}.test.js` : 'default.test.js';
          fs.writeFileSync(path.join(targetDir, fileName), testContent);

          generatePackageJson({
            testDir,
            versionDir: targetDir,
            pkgName: `${currency.name}-v${majorVersion}`,
            currencyName: currency.name,
            currencyVersion: version,
            isOptional
          });
        });
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
      mode: null,
      sourceDepth: 1
    });
    fs.writeFileSync(path.join(versionDir, 'default.test.js'), testContent);

    generatePackageJson({
      testDir,
      versionDir,
      pkgName: `${dirName}-v1`,
      currencyName: null,
      currencyVersion: null,
      isOptional: false
    });
  });
}

main();
