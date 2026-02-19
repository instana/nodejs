#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2026
 *
 * Pre-populates .npm-offline-cache with all packages needed by test version folders.
 * Run before create-version-test-folders.js so that `npm install --prefer-offline` hits the cache.
 */

'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.join(rootDir, '.npm-offline-cache');
const currenciesPath = path.join(rootDir, 'currencies.json');
const collectorTestDir = path.join(rootDir, 'packages', 'collector', 'test');

const CONCURRENCY = 5;
const TIMEOUT = 60_000;

function findTemplates(dir) {
  const results = [];
  function search(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('_v')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        search(full);
      } else if (e.name === 'package.json.template') {
        results.push(full);
      }
    }
  }
  search(dir);
  return results;
}

function collectDependencies() {
  const deps = new Set();

  const currencies = JSON.parse(fs.readFileSync(currenciesPath, 'utf8'));
  for (const currency of currencies) {
    if (!currency.versions || currency.versions.length === 0) continue;
    for (const v of currency.versions) {
      const version = typeof v === 'string' ? v : v.v;
      deps.add(`${currency.name}@${version}`);
    }
  }

  findTemplates(collectorTestDir).forEach(templatePath => {
    try {
      const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        if (!tpl[section]) continue;
        for (const [name, version] of Object.entries(tpl[section])) {
          if (version.startsWith('file:')) continue;
          // npm: aliases like "npm:@opentelemetry/api@1.3.0"
          if (version.startsWith('npm:')) {
            deps.add(version.slice(4));
          } else {
            deps.add(`${name}@${version}`);
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to parse ${templatePath}: ${err.message}`);
    }
  });

  return [...deps].sort();
}

async function cacheAdd(pkg) {
  try {
    await execAsync(`npm cache add "${pkg}" --cache "${cacheDir}"`, { timeout: TIMEOUT });
    return { pkg, ok: true };
  } catch (err) {
    return { pkg, ok: false, error: (err.stderr || err.message).split('\n')[0] };
  }
}

async function runBatched(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

async function main() {
  const deps = collectDependencies();
  console.log(`Pre-caching ${deps.length} packages into ${cacheDir}...\n`);

  let succeeded = 0;
  let failed = 0;

  const results = await runBatched(deps, async pkg => {
    const result = await cacheAdd(pkg);
    const idx = ++succeeded + failed;
    if (result.ok) {
      console.log(`  [${idx}/${deps.length}] ${result.pkg}`);
    } else {
      failed++;
      succeeded--;
      console.warn(`  [${idx}/${deps.length}] FAILED: ${result.pkg} — ${result.error}`);
    }
    return result;
  }, CONCURRENCY);

  console.log(`\nDone: ${succeeded} cached, ${failed} failed out of ${deps.length} total.`);

  if (failed > 0) {
    const failedPkgs = results.filter(r => !r.ok).map(r => r.pkg);
    console.warn(`\nFailed packages:\n  ${failedPkgs.join('\n  ')}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
