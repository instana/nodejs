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
  isOptional,
  verifyDependency
}) {
  const currentYear = new Date().getFullYear();
  const relSourcePath = sourceDepth === 2 ? '../..' : '..';

  return `/*
 * (c) Copyright IBM Corp. ${currentYear}
 */

'use strict';

/** THIS IS A GENERATED FILE. DO NOT MODIFY IT. */

const { execSync, execFileSync } = require('child_process');
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
      !e.name.startsWith('package.json.template') &&
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
  console.log('[ChildProcess] Starting cleanup of copied files...');
  files.forEach(f => {
    // console.log(\`[ChildProcess] Removing \${f}\`);
    rmDir(f);
  });
  console.log('[ChildProcess] Cleanup finished');
}

${
  esmOnly
    ? `if (!process.env.RUN_ESM) {
  it.skip('tracing/${suiteName}@${displayVersion} (ESM-only, set RUN_ESM=true)');
  return;
}

`
    : ''
}${
    nodeConstraint
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
const suiteTitle = \`\${esmPrefix}[\${ts}] tracing/${suiteName}@${displayVersion}${mode ? ` (${mode})` : ''}\`;
mochaSuiteFn(suiteTitle, function () {
  this.timeout(config.getTestTimeout() * 10);
  rmDir(path.join(__dirname, 'node_modules'));
  const copiedFiles = copyParentFiles(__dirname, path.resolve(__dirname, '${relSourcePath}'));
  let isCleaning = false;
  const cleanup = () => {
    if (isCleaning) return;
    isCleaning = true;
    cleanupCopiedFiles(copiedFiles);
  };
  after(() => cleanup());
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    if (isCleaning) {
      log('[WARN] SIGINT received while cleaning up. Please wait...');
      return;
    }
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    if (isCleaning) return;
    cleanup();
    process.exit(143);
  });

  before(async function () {
    const installTimeout = config.getNPMInstallTimeout();
    const maxRetries = 3;
    const semaphoreWait = process.env.CI ? 10 * 60 * 1000 : 0;
    this.timeout(15 * 60 * 1000 + semaphoreWait);

    const slot = process.env.CI ? await installSemaphore.acquireSlot(log) : undefined;
    if (slot !== undefined) log(\`[INFO] Acquired install slot \${slot}\`);
    try {
      rmDir(path.join(__dirname, 'node_modules'));

      log('[INFO] Running npm install for ${suiteName}@${displayVersion}...');
      const npmCmd = process.env.CI ?
        'npm install --cache ${rootDir}/.npm-offline-cache --prefer-offline ' +
        '--no-package-lock --no-audit --prefix ./ --no-progress' :
        'npm install --no-package-lock --no-audit --prefix ./ --no-progress';

      for (let attempt = 0; attempt < maxRetries; attempt++) {${
        isOptional
          ? `
            const timeout = 5 * 60 * 1000;`
          : `
            const timeout = (120 + attempt * 30) * 1000;`
      }
        try {
          execSync(npmCmd, { cwd: __dirname, stdio: 'inherit', timeout });${
            isOptional
              ? `
          if (!fs.existsSync(path.join(__dirname, 'node_modules', '${suiteName}'))) {
            throw new Error('${suiteName} not found after install');
          }`
              : ''
          }
          break;
        } catch (err) {
          console.log(\`[ERROR] npm install failed on attempt \${attempt + 1}: \${err.message}\`);

          if (
            isCleaning ||
            err.signal === 'SIGINT' ||
            err.signal === 'SIGTERM' ||
            err.status === 130 ||
            err.status === 143
          ) {
            throw err;
          }

          if (attempt === maxRetries - 1) throw err;
          const secs = timeout / 1000;
          log(\`[WARN] npm install failed (\${err.message}), retry \${attempt + 1}/\${maxRetries} (\${secs}s)...\`);
          rmDir(path.join(__dirname, 'node_modules'));
          continue;
        }
      }

${
  verifyDependency
    ? `
      log(\`[INFO] Verifying installed ${suiteName}\`);
      try {
        const verifyScript = [
          "const p=require('path'),f=require('fs');",
          "let r=require.resolve('${suiteName}');",
          "const m=p.join('node_modules','${suiteName}');",
          "r=r.substring(0,r.lastIndexOf(m)+m.length);",
          "const e=p.join(process.cwd(),'node_modules','${suiteName}');",
          "if(r!==e){process.stderr.write(r);process.exit(1)}",
          "const v=JSON.parse(f.readFileSync(p.join(e,'package.json'),'utf8')).version;",
          "if(v.replace(/^v/,'')!=='${rawVersion}'.replace(/^v/,'')){process.stderr.write(v);process.exit(2)}",
          "process.stdout.write(r+'|'+v);"
        ].join('');
        const result = execFileSync('node', ['-e', verifyScript], {
          cwd: __dirname,
          encoding: 'utf8',
          timeout: 10000
        });
        const [resolvedPath, resolvedVersion] = result.trim().split('|');
        log(\`[INFO] Path validation successful: \${resolvedPath}\`);
        log(\`[INFO] Version validation successful: ${suiteName}@\${resolvedVersion}\`);
      } catch (err) {
        const detail = (err.stderr || '').trim();
        if (err.status === 1) {
          throw new Error(\`Verification failed: ${suiteName} resolved to \${detail}, expected under __dirname/node_modules\`);
        } else if (err.status === 2) {
          throw new Error(\`Verification failed: installed version \${detail} does not match expected ${rawVersion}\`);
        }
        throw new Error(\`Verification failed: \${err.message}\`);
      }
`
    : ''
}    } finally {
      if (slot !== undefined) installSemaphore.releaseSlot(slot);
    }
  });

  // eslint-disable-next-line global-require,import/no-dynamic-require,import/extensions
  const testBase = require('./test_base');
  testBase.call(this, '${suiteName}', '${rawVersion}', ${isLatest}${mode ? `, '${mode}'` : ''});
});
`;
}

const tgzDir = path.join(collectorTestDir, 'instana-tgz');
const tgzFiles = ['collector.tgz', 'core.tgz', 'shared-metrics.tgz'];

function createTgzSymlinks(targetDir) {
  tgzFiles.forEach(tgz => {
    const linkPath = path.join(targetDir, tgz);
    const target = path.relative(targetDir, path.join(tgzDir, tgz));
    try {
      fs.unlinkSync(linkPath);
    } catch (_) {
      /* not found */
    }
    fs.symlinkSync(target, linkPath);
  });
}

function mergeTemplate(target, templatePath) {
  if (!templatePath || !fs.existsSync(templatePath)) return;
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  Object.entries(template).forEach(([key, value]) => {
    if (typeof value === 'object' && !Array.isArray(value) && typeof target[key] === 'object') {
      Object.assign(target[key], value);
    } else {
      target[key] = value;
    }
  });
}

function generatePackageJson(opts) {
  const { testDir, versionDir, pkgName, currencyName, currencyVersion, isOptional, majorVersion } = opts;
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

  if (majorVersion != null) {
    mergeTemplate(versionPackageJson, path.join(testDir, `package.json.template.v${majorVersion}`));
  }
  if (currencyVersion) {
    mergeTemplate(versionPackageJson, path.join(testDir, `package.json.template.v${currencyVersion}`));
  }

  if (!versionPackageJson.dependencies) {
    versionPackageJson.dependencies = {};
  }

  versionPackageJson.dependencies['@instana/collector'] = 'file:./collector.tgz';
  versionPackageJson.dependencies['@instana/core'] = 'file:./core.tgz';
  versionPackageJson.dependencies['@instana/shared-metrics'] = 'file:./shared-metrics.tgz';

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
        const skipValidation = typeof versionObj === 'object' && versionObj.skipValidation === true;

        modes.forEach(mode => {
          // When modes exist, each mode gets its own subdirectory for isolation
          const targetDir = hasModes ? path.join(versionDir, mode) : versionDir;
          if (hasModes && !fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          createTgzSymlinks(targetDir);

          const testContent = generateTestWrapper({
            suiteName: currency.name,
            displayVersion: dirName.substring(1),
            rawVersion: version,
            isLatest,
            esmOnly,
            mode,
            sourceDepth: hasModes ? 2 : 1,
            nodeConstraint,
            isOptional,
            verifyDependency: !skipValidation
          });
          const fileName = mode ? `${mode}.test.js` : 'default.test.js';
          fs.writeFileSync(path.join(targetDir, fileName), testContent);

          generatePackageJson({
            testDir,
            versionDir: targetDir,
            pkgName: `${currency.name}-v${majorVersion}`,
            currencyName: currency.name,
            currencyVersion: version,
            isOptional,
            majorVersion
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

    createTgzSymlinks(versionDir);

    const testContent = generateTestWrapper({
      suiteName: dirName,
      displayVersion: version,
      rawVersion: version,
      isLatest: true,
      esmOnly: false,
      mode: null,
      sourceDepth: 1,
      verifyDependency: false
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
