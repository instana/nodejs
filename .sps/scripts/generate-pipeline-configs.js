/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const NODE_IMAGE = 'mirror.gcr.io/library/node:24';
const REPO_ROOT = path.join(__dirname, '../..');
const CURRENCIES_DIR = path.join(REPO_ROOT, 'packages/collector/test/integration/currencies');

const sidecarsData = require('../../.tekton/assets/sidecars.json');

// ─── CLI ─────────────────────────────────────────────────────────────────────

const whatArg = process.argv.find(a => a.startsWith('--what='));
if (!whatArg) {
  console.error('Usage: node generate.js --what=<target>');
  console.error('');
  console.error('Collector currency groups:');
  fs.readdirSync(CURRENCIES_DIR).forEach(g => console.error(`  collector-currencies-${g}`));
  console.error('');
  console.error('Other targets:');
  console.error('  collector-metrics');
  console.error('  collector-misc');
  console.error('  aws-lambda');
  console.error('  aws-fargate');
  console.error('  azure-container-services');
  console.error('  google-cloud-run');
  console.error('  autoprofile');
  console.error('  core');
  console.error('  metrics-util');
  console.error('  opentelemetry-exporter');
  console.error('  opentelemetry-sampler');
  console.error('  serverless');
  console.error('  serverless-collector');
  console.error('  shared-metrics');
  process.exit(1);
}
const TARGET = whatArg.split('=')[1];

// ─── sidecar helpers ─────────────────────────────────────────────────────────

function sidecar(name) {
  return sidecarsData.sidecars.find(s => s.name === name);
}

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

  return lines.map((l, i) => (i < lines.length - 1 ? l + ' \\' : l)).join('\n');
}

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

function readNeeds(folder) {
  const needsPath = path.join(folder, '.needs');
  if (!fs.existsSync(needsPath)) return [];
  return fs.readFileSync(needsPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
}

function dockerClientInstallScript() {
  return [
    'CODENAME=$(. /etc/os-release; echo "$VERSION_CODENAME")',
    'ARCH=$(dpkg --print-architecture)',
    'apt-get update -qq && apt-get install -y -qq ca-certificates curl gnupg netcat-openbsd',
    'install -m 0755 -d /etc/apt/keyrings',
    'curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
    'chmod a+r /etc/apt/keyrings/docker.gpg',
    'echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${CODENAME} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
    'apt-get update -qq && apt-get install -y -qq docker-ce-cli',
    "timeout 30 bash -c 'until [ -S /var/run/docker.sock ]; do sleep 1; done'"
  ].join('\n');
}

// ─── collector currencies fan-out tasks ──────────────────────────────────────

function findTestFolders(groupDir) {
  const folders = [];
  for (const entry of fs.readdirSync(groupDir)) {
    const fullPath = path.join(groupDir, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;
    if (entry.startsWith('@')) {
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

function buildCurrencyTask(pkgName, folder, group) {
  const needs = readNeeds(folder);
  const relFolder = path.relative(REPO_ROOT, folder).replace(/\\/g, '/');

  const scriptLines = ['#!/usr/bin/env bash', 'set -eo pipefail', ''];
  scriptLines.push('cd "$WORKSPACE/$(load_repo app-repo path)"');
  scriptLines.push('npm install --loglevel warn --foreground-scripts');
  scriptLines.push('node bin/create-version-test-folders.js');
  scriptLines.push('');

  if (needs.length > 0) {
    scriptLines.push('# install docker client');
    scriptLines.push(dockerClientInstallScript());
    scriptLines.push('');
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
  scriptLines.push('exec env -i \\');
  scriptLines.push('  PATH="$PATH" \\');
  scriptLines.push('  HOME="$HOME" \\');
  scriptLines.push('  CI=true \\');
  scriptLines.push('  TEST_FILES="$TEST_FILES" \\');
  scriptLines.push('  npm run test:ci:collector');

  const taskName = `pr-code-checks-collector-${group}-${pkgName.replace(/[@/]/g, '').replace(/[._]/g, '-')}`;

  return {
    taskName,
    task: {
      from: 'pr-code-checks',
      displayName: pkgName,
      runtimeClassName: 'large',
      ...(needs.length > 0 ? { include: ['dind'] } : {}),
      steps: [
        {
          name: 'run-stage',
          displayName: pkgName,
          image: NODE_IMAGE,
          ...(needs.length > 0 ? { include: ['docker-socket'] } : {}),
          script: scriptLines.join('\n')
        }
      ]
    }
  };
}

// ─── simple single-task config builder ───────────────────────────────────────

function buildSimpleTask(displayName, testScript, needs = []) {
  const scriptLines = ['#!/usr/bin/env bash', 'set -eo pipefail', ''];
  scriptLines.push('cd "$WORKSPACE/$(load_repo app-repo path)"');
  scriptLines.push('npm install --loglevel warn --foreground-scripts');
  scriptLines.push('');

  if (needs.length > 0) {
    scriptLines.push('# install docker client');
    scriptLines.push(dockerClientInstallScript());
    scriptLines.push('');
    for (const need of needs) {
      scriptLines.push(`# start ${need}`);
      scriptLines.push(dockerRunScript(need));
      const wait = readinessScript(need);
      if (wait) scriptLines.push(wait);
      scriptLines.push('');
    }
  }

  scriptLines.push(`exec env -i \\`);
  scriptLines.push('  PATH="$PATH" \\');
  scriptLines.push('  HOME="$HOME" \\');
  scriptLines.push('  CI=true \\');
  scriptLines.push(`  npm run ${testScript}`);

  return {
    from: 'pr-code-checks',
    displayName,
    runtimeClassName: 'large',
    ...(needs.length > 0 ? { include: ['dind'] } : {}),
    steps: [
      {
        name: 'run-stage',
        displayName,
        image: NODE_IMAGE,
        ...(needs.length > 0 ? { include: ['docker-socket'] } : {}),
        script: scriptLines.join('\n')
      }
    ]
  };
}

// ─── base config skeleton ─────────────────────────────────────────────────────

function baseConfig(fanOutTasks) {
  return {
    version: '2',
    tasks: {
      'pr-code-checks': {
        runtimeClassName: 'large',
        steps: [
          {
            name: 'run-stage',
            displayName: 'npm-install',
            image: NODE_IMAGE,
            script: [
              '#!/usr/bin/env bash',
              'set -eo pipefail',
              'cd "$WORKSPACE/$(load_repo app-repo path)"',
              'npm install --loglevel warn --foreground-scripts',
              'node bin/create-version-test-folders.js'
            ].join('\n')
          }
        ]
      },
      ...fanOutTasks,
      'code-pr-finish': {
        steps: [{ name: 'run-stage', when: 'false' }]
      }
    }
  };
}

function writeConfig(name, config) {
  const output = yaml.dump(config, { lineWidth: -1, quotingType: "'", forceQuotes: false });
  const outPath = path.join(__dirname, '..', `pipeline-config-${name}.yaml`);
  fs.writeFileSync(outPath, output);
  console.log(`Written: ${outPath}`);
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

if (TARGET.startsWith('collector-currencies-')) {
  const group = TARGET.replace('collector-currencies-', '');
  const groupDir = path.join(CURRENCIES_DIR, group);
  if (!fs.existsSync(groupDir)) {
    console.error(`Unknown currency group: ${group}`);
    process.exit(1);
  }

  const folders = findTestFolders(groupDir);
  const tasks = folders.map(({ pkgName, folder }) => buildCurrencyTask(pkgName, folder, group));

  const fanOutTasks = {};
  tasks.forEach(({ taskName, task }) => { fanOutTasks[taskName] = task; });

  writeConfig(TARGET, baseConfig(fanOutTasks));
  console.log(`\nGenerated ${tasks.length} tasks for group '${group}':`);
  folders.forEach(({ pkgName, folder }) => {
    const needs = readNeeds(folder);
    console.log(`  ${pkgName.padEnd(40)} needs: [${needs.join(', ') || 'none'}]`);
  });

} else if (TARGET === 'collector-metrics' || TARGET === 'collector-misc') {
  const subDir = TARGET.replace('collector-', '');
  const testDir = path.join(REPO_ROOT, 'packages/collector/test/integration', subDir);
  const relDir = `test/integration/${subDir}`;

  const scriptLines = [
    '#!/usr/bin/env bash',
    'set -eo pipefail',
    '',
    'cd "$WORKSPACE/$(load_repo app-repo path)"',
    'npm install --loglevel warn --foreground-scripts',
    'node bin/create-version-test-folders.js',
    '',
    '# collect test files',
    `TEST_FILES=$(cd packages/collector && find \\`,
    `  ${relDir} \\`,
    `  -name '*.test.js' \\`,
    `  -not -path '*/node_modules/*' \\`,
    `  | sort | tr '\\n' ' ')`,
    '',
    'if [ -z "$TEST_FILES" ]; then',
    `  echo 'WARNING: No test files found for ${TARGET} — skipping.'`,
    '  exit 0',
    'fi',
    '',
    'exec env -i \\',
    '  PATH="$PATH" \\',
    '  HOME="$HOME" \\',
    '  CI=true \\',
    '  TEST_FILES="$TEST_FILES" \\',
    '  npm run test:ci:collector'
  ].join('\n');

  const fanOutTasks = {
    [`pr-code-checks-${TARGET}`]: {
      from: 'pr-code-checks',
      displayName: TARGET,
      runtimeClassName: 'large',
      steps: [
        { name: 'run-stage', displayName: TARGET, image: NODE_IMAGE, script: scriptLines }
      ]
    }
  };

  writeConfig(TARGET, baseConfig(fanOutTasks));

} else {
  const SIMPLE_TARGETS = {
    'aws-lambda':                { script: 'test:ci:aws-lambda',                displayName: 'aws-lambda' },
    'aws-fargate':               { script: 'test:ci:aws-fargate',               displayName: 'aws-fargate' },
    'azure-container-services':  { script: 'test:ci:azure-container-services',  displayName: 'azure-container-services' },
    'google-cloud-run':          { script: 'test:ci:google-cloud-run',          displayName: 'google-cloud-run' },
    'autoprofile':               { script: 'test:ci:autoprofile',               displayName: 'autoprofile' },
    'core':                      { script: 'test:ci:core',                      displayName: 'core' },
    'metrics-util':              { script: 'test:ci:metrics-util',              displayName: 'metrics-util' },
    'opentelemetry-exporter':    { script: 'test:ci:opentelemetry-exporter',    displayName: 'opentelemetry-exporter' },
    'opentelemetry-sampler':     { script: 'test:ci:opentelemetry-sampler',     displayName: 'opentelemetry-sampler' },
    'serverless':                { script: 'test:ci:serverless',                displayName: 'serverless' },
    'serverless-collector':      { script: 'test:ci:serverless-collector',      displayName: 'serverless-collector' },
    'shared-metrics':            { script: 'test:ci:shared-metrics',            displayName: 'shared-metrics' }
  };

  if (!SIMPLE_TARGETS[TARGET]) {
    console.error(`Unknown target: ${TARGET}`);
    process.exit(1);
  }

  const { script, displayName } = SIMPLE_TARGETS[TARGET];
  const taskName = `pr-code-checks-${TARGET}`;
  const fanOutTasks = { [taskName]: buildSimpleTask(displayName, script) };

  writeConfig(TARGET, baseConfig(fanOutTasks));
  console.log(`Generated task '${taskName}' running: npm run ${script}`);
}
