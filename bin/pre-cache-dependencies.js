#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2026
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
const TIMEOUT = 60000;

function findTemplates(dir) {
  const results = [];

  function search(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }

    entries
      .filter(e => e.name !== 'node_modules' && !e.name.startsWith('_v'))
      .forEach(e => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          search(full);
        } else if (e.name === 'package.json.template') {
          results.push(full);
        }
      });
  }

  search(dir);
  return results;
}

function collectDependencies() {
  const deps = new Set();

  const currencies = JSON.parse(fs.readFileSync(currenciesPath, 'utf8'));
  currencies.forEach(currency => {
    if (!currency.versions || currency.versions.length === 0) return;
    currency.versions.forEach(v => {
      const version = typeof v === 'string' ? v : v.v;
      deps.add(`${currency.name}@${version}`);
    });
  });

  findTemplates(collectorTestDir).forEach(templatePath => {
    try {
      const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
      ['dependencies', 'devDependencies', 'optionalDependencies'].forEach(section => {
        if (!tpl[section]) return;
        Object.entries(tpl[section]).forEach(([name, version]) => {
          if (version.startsWith('file:')) return;
          // npm: aliases like "npm:@opentelemetry/api@1.3.0"
          if (version.startsWith('npm:')) {
            deps.add(version.slice(4));
          } else {
            deps.add(`${name}@${version}`);
          }
        });
      });
    } catch (err) {
      console.warn(`Failed to parse ${templatePath}: ${err.message}`);
    }
  });

  return [...deps].sort();
}

function cacheAdd(pkg) {
  return execAsync(`npm cache add "${pkg}" --cache "${cacheDir}"`, { timeout: TIMEOUT })
    .then(() => ({ pkg, ok: true }))
    .catch(err => ({ pkg, ok: false, error: (err.stderr || err.message).split('\n')[0] }));
}

function runBatched(items, fn, concurrency) {
  let pos = 0;
  const results = [];

  function next() {
    if (pos >= items.length) return Promise.resolve();
    const batch = items.slice(pos, pos + concurrency);
    pos += concurrency;
    return Promise.all(batch.map(fn)).then(batchResults => {
      results.push(...batchResults);
      return next();
    });
  }

  return next().then(() => results);
}

function main() {
  const deps = collectDependencies();
  console.log(`Pre-caching ${deps.length} packages into ${cacheDir}...\n`);

  let succeeded = 0;
  let failed = 0;

  return runBatched(
    deps,
    pkg =>
      cacheAdd(pkg).then(result => {
        const idx = succeeded + failed + 1;
        if (result.ok) {
          succeeded++;
          console.log(`  [${idx}/${deps.length}] ${result.pkg}`);
        } else {
          failed++;
          console.warn(`  [${idx}/${deps.length}] FAILED: ${result.pkg} — ${result.error}`);
        }
        return result;
      }),
    CONCURRENCY
  ).then(results => {
    console.log(`\nDone: ${succeeded} cached, ${failed} failed out of ${deps.length} total.`);

    if (failed > 0) {
      const failedPkgs = results.filter(r => !r.ok).map(r => r.pkg);
      console.warn(`\nFailed packages:\n  ${failedPkgs.join('\n  ')}`);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
