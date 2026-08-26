/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const NODE_IMAGE = 'mirror.gcr.io/library/node:24';
const REPO_ROOT = path.join(__dirname, '..');
const CURRENCIES_DIR = path.join(REPO_ROOT, 'packages/collector/test/integration/currencies');

const sidecarsData = require('../.tekton/assets/sidecars.json');

// ─── CLI args ────────────────────────────────────────────────────────────────

const whatArg = process.argv.find(a => a.startsWith('--what='));
if (!whatArg) {
  console.error('Usage: node generate.js --what=<group>');
  console.error('Available groups:', fs.readdirSync(CURRENCIES_DIR).join(', '));
  process.exit(1);
}
const GROUP = whatArg.split('=')[1];
const GROUP_DIR = path.join(CURRENCIES_DIR, GROUP);
if (!fs.existsSync(GROUP_DIR)) {
  console.error(`Unknown group: ${GROUP}`);
  console.error('Available groups:', fs.readdirSync(CURRENCIES_DIR).join(', '));
  process.exit(1);
}

// ─── helpers ────────────────────────────────────────────────────────────────

function sidecar(name) {
  return sidecarsData.sidecars.find(s => s.name === name);
}

/**
 * Build the `docker run` shell fragment for one sidecar entry from sidecars.json.
 * Returns a multi-line string.
 */
function dockerRunScript(name) {
  const s = sidecar(name);
  if (!s) throw new Error(`Unknown sidecar: ${name}`);

  const lines = [`docker run -d --network host --name ${name}`];

  if (s.env) {
    for (const e of s.env) {
      lines.push(`  -e ${e.name}=${JSON.stringify(e.value)}`);
    }
  }

  if (s.command) {
    // command entries become the entrypoint override — not supported in a clean
    // one-liner, so we pass them via --entrypoint + positional args
    const [entrypoint, ...rest] = s.command;
    lines.push(`  --entrypoint ${JSON.stringify(entrypoint)}`);
    lines.push(`  ${JSON.stringify(s.image.trim())}`);
    if (rest.length) lines[lines.length - 1] += ` ${rest.map(a => JSON.stringify(a)).join(' ')}`;
    if (s.args) lines[lines.length - 1] += ` ${s.args.map(a => JSON.stringify(a)).join(' ')}`;
  } else {
    lines.push(`  ${JSON.stringify(s.image.trim())}`);
    if (s.args) {
      lines[lines.length - 1] += ` ${s.args.map(a => JSON.stringify(a)).join(' ')}`;
    }
  }

  // join with \ continuation — last line has no continuation
  return lines.map((l, i) => (i < lines.length - 1 ? l + ' \\' : l)).join('\n');
}

/**
 * Build the readiness-wait shell fragment for one sidecar.
 * Returns a string (may be empty for sidecars without a readinessProbe).
 */
function readinessScript(name) {
  const s = sidecar(name);
  if (!s || !s.readinessProbe) return '';

  const rp = s.readinessProbe;
  const timeout = (rp.timeoutSeconds || 60) + (rp.initialDelaySeconds || 0);

  if (rp.exec) {
    const cmd = rp.exec.command.map(c => JSON.stringify(c)).join(' ');
    return `timeout ${timeout} bash -c 'until ${cmd} >/dev/null 2>&1; do sleep 2; done'`;
  }
  if (rp.tcpSocket) {
    return `timeout ${timeout} bash -c 'until nc -z 127.0.0.1 ${rp.tcpSocket.port} 2>/dev/null; do sleep 2; done'`;
  }
  if (rp.httpGet) {
    return `timeout ${timeout} bash -c 'until curl -sf http://127.0.0.1:${rp.httpGet.port}${rp.httpGet.path} 2>/dev/null; do sleep 2; done'`;
  }
  return '';
}

/**
 * Read .needs file for a test folder. Returns [] if none exists.
 */
function readNeeds(folder) {
  const needsPath = path.join(folder, '.needs');
  if (!fs.existsSync(needsPath)) return [];
  return fs
    .readFileSync(needsPath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Collect all test folders (direct children + one level of scoped packages)
 * from the group directory on disk.
 */
function findTestFolders() {
  const folders = [];

  for (const entry of fs.readdirSync(GROUP_DIR)) {
    const fullPath = path.join(GROUP_DIR, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    if (entry.startsWith('@')) {
      // scoped package: check children
      for (const sub of fs.readdirSync(fullPath)) {
        const subPath = path.join(fullPath, sub);
        if (!fs.statSync(subPath).isDirectory()) continue;
        folders.push({ pkgName: `${entry}/${sub}`, folder: subPath });
      }
    } else {
      folders.push({ pkgName: entry, folder: fullPath });
    }
  }

  return folders;
}

/**
 * Build a single SPS task for one test folder.
 * Each package gets its own top-level task with from: code-build.
 */
function buildTask(pkgName, folder) {
  const needs = readNeeds(folder);

  // relative path used in find command (relative to repo root)
  const relFolder = path.relative(REPO_ROOT, folder).replace(/\\/g, '/');

  const scriptLines = ['#!/usr/bin/env bash', 'set -eo pipefail', ''];

  scriptLines.push('cd "$WORKSPACE/$(load_repo app-repo path)"');
  scriptLines.push('npm install --loglevel warn --foreground-scripts');
  scriptLines.push('node bin/create-version-test-folders.js');
  scriptLines.push('');

  if (needs.length > 0) {
    scriptLines.push('# install docker client');
    scriptLines.push(
      'CODENAME=$(. /etc/os-release; echo "$VERSION_CODENAME")',
      'ARCH=$(dpkg --print-architecture)',
      'apt-get update -qq && apt-get install -y -qq ca-certificates curl gnupg netcat-openbsd',
      'install -m 0755 -d /etc/apt/keyrings',
      'curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
      'chmod a+r /etc/apt/keyrings/docker.gpg',
      'echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${CODENAME} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
      'apt-get update -qq && apt-get install -y -qq docker-ce-cli',
      "timeout 30 bash -c 'until [ -S /var/run/docker.sock ]; do sleep 1; done'",
      ''
    );

    for (const need of needs) {
      scriptLines.push(`# start ${need}`);
      scriptLines.push(dockerRunScript(need));
      const wait = readinessScript(need);
      if (wait) scriptLines.push(wait);
      scriptLines.push('');
    }
  }

  scriptLines.push('# collect test files');
  scriptLines.push(`TEST_FILES=$(cd packages/collector && find \\`);
  scriptLines.push(`  ${relFolder.replace('packages/collector/', '')} \\`);
  scriptLines.push(`  -name '*.test.js' \\`);
  scriptLines.push(`  -not -path '*/node_modules/*' \\`);
  scriptLines.push(`  | sort | tr '\\n' ' ')`);
  scriptLines.push('');
  scriptLines.push('if [ -z "$TEST_FILES" ]; then');
  scriptLines.push(`  echo 'WARNING: No test files found for ${pkgName} — skipping.'`);
  scriptLines.push('  exit 0');
  scriptLines.push('fi');
  scriptLines.push('');
  scriptLines.push('# run tests with clean environment — only PATH, HOME, CI and TEST_FILES are passed');
  scriptLines.push('exec env -i \\');
  scriptLines.push('  PATH="$PATH" \\');
  scriptLines.push('  HOME="$HOME" \\');
  scriptLines.push('  CI=true \\');
  scriptLines.push('  TEST_FILES="$TEST_FILES" \\');
  scriptLines.push('  npm run test:ci:collector');

  // safe task name: pr-code-build-<group>-<pkg>, replace / and @ with nothing, . with -
  const taskName = `pr-code-build-${GROUP}-${pkgName.replace(/[@/]/g, '').replace(/\./g, '-')}`;

  return {
    taskName,
    task: {
      from: 'code-build',
      displayName: pkgName,
      runtimeClassName: 'large',
      ...(needs.length > 0 ? { include: ['dind'] } : {}),
      steps: [
        {
          name: 'build-artifact',
          displayName: pkgName,
          image: NODE_IMAGE,
          ...(needs.length > 0 ? { include: ['docker-socket'] } : {}),
          script: scriptLines.join('\n')
        },
        { name: 'sign-artifact', when: 'false' }
      ]
    }
  };
}

// ─── build tasks ────────────────────────────────────────────────────────────

const messagingFolders = findTestFolders();
const messagingTasks = messagingFolders.map(({ pkgName, folder }) => buildTask(pkgName, folder));

// ─── full config ─────────────────────────────────────────────────────────────

const fanOutTasks = {};
messagingTasks.forEach(({ taskName, task }) => {
  fanOutTasks[taskName] = task;
});

const config = {
  version: '2',
  tasks: {
    'code-checks': {
      steps: [{ name: 'peer-review', when: 'false' }]
    },
    'code-build': {
      runtimeClassName: 'large',
      steps: [
        {
          name: 'build-artifact',
          displayName: 'npm-install',
          image: NODE_IMAGE,
          script: [
            '#!/usr/bin/env bash',
            'set -eo pipefail',
            'cd "$WORKSPACE/$(load_repo app-repo path)"',
            'npm install --loglevel warn --foreground-scripts',
            'node bin/create-version-test-folders.js'
          ].join('\n')
        },
        { name: 'unit-test', when: 'false' },
        { name: 'scan-artifact', when: 'false' },
        { name: 'sign-artifact', when: 'false' }
      ]
    },
    ...fanOutTasks,
    'sign-artifact': { when: 'false' },
    'deploy-checks': { when: 'false' },
    'deploy-release': { when: 'false' },
    'code-ci-finish': {
      steps: [{ name: 'run-stage', when: 'false' }]
    }
  }
};

const output = yaml.dump(config, { lineWidth: -1, quotingType: "'", forceQuotes: false });
const outPath = path.join(__dirname, `pipeline-config-collector-${GROUP}.yaml`);
fs.writeFileSync(outPath, output);
console.log(`Written: ${outPath}`);
console.log(`\nGenerated ${messagingTasks.length} tasks for group '${GROUP}':`);
messagingFolders.forEach(({ pkgName, folder }) => {
  const needs = readNeeds(folder);
  console.log(`  ${pkgName.padEnd(40)} needs: [${needs.join(', ') || 'none'}]`);
});
