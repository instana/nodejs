#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const currenciesPath = path.join(rootDir, 'currencies.json');
const collectorTestDir = path.join(rootDir, 'packages', 'collector', 'test');

const currencyFilter = (() => {
  const idx = process.argv.indexOf('--currency');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const versionFilter = (() => {
  const idx = process.argv.indexOf('--version');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

function getInstanaVersion() {
  try {
    return execSync('npm view @instana/collector version', { encoding: 'utf8' }).trim();
  } catch (_) {
    return null;
  }
}

function findTestDirectories(baseDir, name) {
  const results = [];
  const parts = name.split('/');

  function search(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    entries
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('_v'))
      .forEach(entry => {
        const full = path.join(dir, entry.name);
        if (parts.length === 2) {
          if (entry.name === parts[0]) {
            const inner = path.join(full, parts[1]);
            if (fs.existsSync(inner) && fs.statSync(inner).isDirectory()) {
              results.push(inner);
            }
          }
        } else if (entry.name === name) {
          results.push(full);
        }
        search(full);
      });
  }

  search(baseDir);
  return results;
}

function generateLockFile(currencyName, version, testDir, instanaVersion) {
  const safeName = currencyName.replace(/\//g, '-').replace(/^@/, '');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `instana-lock-${safeName}-${version}-`));

  try {
    const dependencies = { [currencyName]: version };
    if (instanaVersion) {
      dependencies['@instana/collector'] = instanaVersion;
      dependencies['@instana/core'] = instanaVersion;
      dependencies['@instana/shared-metrics'] = instanaVersion;
    }
    const pkgJson = {
      name: `lock-gen-${safeName}-v${version}`,
      dependencies
    };
    fs.writeFileSync(path.join(tmpDir, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`);

    console.log(`  Generating lock file for ${currencyName}@${version}...`);
    execSync('npm install --package-lock-only --no-audit --no-progress', {
      cwd: tmpDir,
      stdio: 'inherit',
      timeout: 5 * 60 * 1000
    });

    const lockSrc = path.join(tmpDir, 'package-lock.json');
    if (!fs.existsSync(lockSrc)) {
      console.warn(`  WARNING: no package-lock.json generated for ${currencyName}@${version}`);
      return;
    }

    fs.copyFileSync(lockSrc, path.join(testDir, `package-lock.json.v${version}`));
    console.log(`  Saved → ${path.relative(rootDir, path.join(testDir, `package-lock.json.v${version}`))}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function removeOldLockFiles(testDir, keepVersions) {
  fs.readdirSync(testDir)
    .filter(f => f.startsWith('package-lock.json.v') && !keepVersions.includes(f.slice('package-lock.json.v'.length)))
    .forEach(f => {
      fs.rmSync(path.join(testDir, f));
      console.log(`  Removed → ${path.relative(rootDir, path.join(testDir, f))}`);
    });
}

function generateLockFileFromTemplate(templatePath, instanaVersion) {
  const testDir = path.dirname(templatePath);
  const safeName = path.relative(collectorTestDir, testDir).replace(/[/@]/g, '-');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `instana-lock-tpl-${safeName}-`));

  try {
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const dependencies = {};
    ['dependencies', 'devDependencies', 'optionalDependencies'].forEach(section => {
      if (!tpl[section]) return;
      Object.entries(tpl[section]).forEach(([name, ver]) => {
        if (!ver.startsWith('file:') && !ver.startsWith('{{')) {
          dependencies[name] = ver;
        }
      });
    });
    if (instanaVersion) {
      dependencies['@instana/collector'] = instanaVersion;
      dependencies['@instana/core'] = instanaVersion;
      dependencies['@instana/shared-metrics'] = instanaVersion;
    }
    if (Object.keys(dependencies).length === 0) return;

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      `${JSON.stringify({ name: `lock-gen-tpl-${safeName}`, dependencies }, null, 2)}\n`
    );

    console.log(`  Generating lock file for template ${path.relative(rootDir, templatePath)}...`);
    execSync('npm install --package-lock-only --no-audit --no-progress', {
      cwd: tmpDir,
      stdio: 'inherit',
      timeout: 5 * 60 * 1000
    });

    const lockSrc = path.join(tmpDir, 'package-lock.json');
    if (!fs.existsSync(lockSrc)) {
      console.warn(`  WARNING: no package-lock.json generated for ${templatePath}`);
      return;
    }

    fs.copyFileSync(lockSrc, path.join(testDir, 'package-lock.json.template'));
    console.log(`  Saved → ${path.relative(rootDir, path.join(testDir, 'package-lock.json.template'))}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function findTemplateDirs(baseDir) {
  const results = [];
  function search(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    entries
      .filter(e => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('_v'))
      .forEach(e => {
        search(path.join(dir, e.name));
      });
    const tpl = path.join(dir, 'package.json.template');
    if (fs.existsSync(tpl)) results.push(tpl);
  }
  search(baseDir);
  return results;
}

function main() {
  const instanaVersion = getInstanaVersion();
  if (instanaVersion) {
    console.log(`Using @instana/collector@${instanaVersion} for lock file generation`);
  }

  const currencies = JSON.parse(fs.readFileSync(currenciesPath, 'utf8'));

  currencies.forEach(currency => {
    if (currencyFilter && currency.name !== currencyFilter) return;
    if (!currency.versions || currency.versions.length === 0) return;

    const testDirs = findTestDirectories(collectorTestDir, currency.name);
    if (testDirs.length === 0) return;

    console.log(`\n[${currency.name}]`);
    const allVersions = currency.versions.map(v => (typeof v === 'string' ? v : v.v));
    testDirs.forEach(testDir => {
      allVersions.forEach(version => {
        if (versionFilter && version !== versionFilter) return;
        generateLockFile(currency.name, version, testDir, instanaVersion);
      });
      removeOldLockFiles(testDir, allVersions);
    });
  });

  if (!currencyFilter && !versionFilter) {
    console.log('\n[templates]');
    findTemplateDirs(collectorTestDir).forEach(tpl => {
      generateLockFileFromTemplate(tpl, instanaVersion);
    });
  }
}

main();
