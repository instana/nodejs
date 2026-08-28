/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.join(__dirname, '../..');
const CURRENCIES_DIR = path.join(REPO_ROOT, 'packages/collector/test/integration/currencies');

const sidecarsData = require('../../.tekton/assets/sidecars.json');

// ─── CLI ─────────────────────────────────────────────────────────────────────

const whatArg  = process.argv.find(a => a.startsWith('--what='));
const nodeArg  = process.argv.find(a => a.startsWith('--node-version='));
const modeArg  = process.argv.find(a => a.startsWith('--mode='));

const MODE = modeArg ? modeArg.split('=')[1] : 'all'; // 'all' | 'pr' | 'main' | 'manual'
if (!['all', 'pr', 'main', 'manual'].includes(MODE)) {
  console.error(`Unknown --mode: ${MODE}. Use 'all', 'pr', 'main' or 'manual'.`);
  process.exit(1);
}

// All targets to generate when --what is omitted
const ALL_CURRENCY_GROUPS = fs.readdirSync(CURRENCIES_DIR).map(g => `collector-currencies-${g}`);
const ALL_SIMPLE_TARGETS  = [
  'collector-metrics', 'collector-misc',
  'cloud', 'autoprofile', 'core-group', 'opentelemetry'
];
const ALL_TARGETS = ['default', ...ALL_CURRENCY_GROUPS, ...ALL_SIMPLE_TARGETS];

// 'manual' folder is identical to 'main' (ci-listener, code-build tasks)

const TARGET = whatArg ? whatArg.split('=')[1] : null;
const NODE_IMAGE = 'mirror.gcr.io/library/node:24';

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
  if (!s) return '';
  return 'sleep 60';
}

function readNeeds(folder) {
  const needsPath = path.join(folder, '.needs');
  if (!fs.existsSync(needsPath)) return [];
  return fs.readFileSync(needsPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
}

function nodeVersionSwitchScript() {
  return [
    'node_version="$(get_env node-version 2>/dev/null || true)"',
    'if [ -n "${node_version:-}" ]; then',
    '  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash',
    '  export NVM_DIR="$HOME/.nvm"',
    '  # shellcheck source=/dev/null',
    '  . "$NVM_DIR/nvm.sh"',
    '  nvm install "$node_version" --no-progress',
    '  nvm use "$node_version"',
    '  ACTUAL=$(node --version)',
    '  if [[ "$ACTUAL" != "v${node_version}"* ]]; then',
    '    echo "ERROR: expected Node.js v${node_version} but got ${ACTUAL}"',
    '    exit 1',
    '  fi',
    'fi',
    'echo "Node.js: $(node --version)"'
  ].join('\n');
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
  scriptLines.push(nodeVersionSwitchScript());
  scriptLines.push('');
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

  const prefix   = MODE === 'main' ? 'code-build' : 'pr-code-checks';
  const taskName = `${prefix}-collector-${group}-${pkgName.replace(/[@/]/g, '').replace(/[._]/g, '-')}`;

  return {
    taskName,
    taskNameMain: taskName.replace('pr-code-checks', 'code-build'),
    task: {
      from: MODE === 'main' ? 'code-build' : 'pr-code-checks',
      displayName: pkgName,
      runtimeClassName: 'large',
      ...(needs.length > 0 ? { include: ['dind'] } : {}),
      steps: [
        { name: 'peer-review', when: 'false' },
        { name: 'detect-secrets', when: 'false' },
        { name: 'compliance-checks', when: 'false' },
        {
          name: 'unit-test',
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

function buildSimpleTask(displayName, testScript, needs = [], extraEnv = null) {
  const scriptLines = ['#!/usr/bin/env bash', 'set -eo pipefail', ''];
  scriptLines.push(nodeVersionSwitchScript());
  scriptLines.push('');
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

  if (extraEnv) {
    scriptLines.push(`export ${extraEnv}`);
    scriptLines.push('');
  }

  scriptLines.push(`exec env -i \\`);
  scriptLines.push('  PATH="$PATH" \\');
  scriptLines.push('  HOME="$HOME" \\');
  scriptLines.push('  CI=true \\');
  if (extraEnv) {
    const varName = extraEnv.split('=')[0];
    scriptLines.push(`  ${varName}="$${varName}" \\`);
  }
  scriptLines.push(`  npm run ${testScript}`);

  return {
    from: 'pr-code-checks',
    displayName,
    runtimeClassName: 'large',
    ...(needs.length > 0 ? { include: ['dind'] } : {}),
    steps: [
      { name: 'peer-review', when: 'false' },
      { name: 'detect-secrets', when: 'false' },
      { name: 'compliance-checks', when: 'false' },
      {
        name: 'unit-test',
        displayName,
        image: NODE_IMAGE,
        ...(needs.length > 0 ? { include: ['docker-socket'] } : {}),
        script: scriptLines.join('\n')
      }
    ]
  };
}

// ─── base config skeleton ─────────────────────────────────────────────────────

function baseConfig(fanOutTasks, rootTask = 'pr-code-checks') {
  return {
    version: '2',
    tasks: {
      [rootTask]: {
        runtimeClassName: 'large',
        steps: [
          { name: 'peer-review', when: 'false' },
          { name: 'detect-secrets', when: 'false' },
          { name: 'compliance-checks', when: 'false' },
          {
            name: 'unit-test',
            displayName: 'npm-install',
            image: NODE_IMAGE,
            script: [
              '#!/usr/bin/env bash',
              'set -eo pipefail',
              nodeVersionSwitchScript(),
              '',
              'cd "$WORKSPACE/$(load_repo app-repo path)"',
              'npm install --loglevel warn --foreground-scripts',
              'node bin/create-version-test-folders.js'
            ].join('\n')
          }
        ]
      },
      ...fanOutTasks
    }
  };
}

function writeConfig(name, prConfig, mainConfig) {
  function write(filePath, config) {
    const outDir = path.dirname(filePath);
    fs.mkdirSync(outDir, { recursive: true });
    const output = yaml.dump(config, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    fs.writeFileSync(filePath, output);
    console.log(`Written: ${filePath}`);
  }

  const spsDir = path.join(__dirname, '..');
  if (MODE === 'all' || MODE === 'pr')     write(path.join(spsDir, 'pr',     `pipeline-config-${name}.yaml`), prConfig);
  if (MODE === 'all' || MODE === 'main')   write(path.join(spsDir, 'main',   `pipeline-config-${name}.yaml`), mainConfig);
  if (MODE === 'all' || MODE === 'manual') write(path.join(spsDir, 'manual', `pipeline-config-${name}.yaml`), mainConfig);
}

function writeDefaultConfig(prConfig, mainConfig) {
  const spsDir = path.join(__dirname, '..');
  function write(filePath, config) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const output = yaml.dump(config, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    fs.writeFileSync(filePath, output);
    console.log(`Written: ${filePath}`);
  }
  if (MODE === 'all' || MODE === 'pr')     write(path.join(spsDir, 'pr',     'pipeline-config.yaml'), prConfig);
  if (MODE === 'all' || MODE === 'main')   write(path.join(spsDir, 'main',   'pipeline-config.yaml'), mainConfig);
  if (MODE === 'all' || MODE === 'manual') write(path.join(spsDir, 'manual', 'pipeline-config.yaml'), mainConfig);
  if (MODE === 'all')                      write(path.join(spsDir,           'pipeline-config.yaml'), prConfig);
}

// Convert a pr config to a main config by swapping pr-code-checks → code-build task names
function toMainConfig(prConfig) {
  const raw  = yaml.dump(prConfig, { lineWidth: -1 });
  const main = raw
    .replace(/\bpr-code-checks\b/g, 'code-build');
  return yaml.load(main);
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

const SIMPLE_TARGETS = {
  'aws-lambda':                { script: 'test:ci:aws-lambda',                displayName: 'aws-lambda' },
  'aws-fargate':               { script: 'test:ci:aws-fargate',               displayName: 'aws-fargate' },
  'azure-container-services':  { script: 'test:ci:azure-container-services',  displayName: 'azure-container-services' },
  'google-cloud-run':          { script: 'test:ci:google-cloud-run',          displayName: 'google-cloud-run' },
  'autoprofile':               { script: 'test:ci:autoprofile',               displayName: 'autoprofile',
                                 extraEnv: 'CI_AUTOPROFILE_TEST_FILES=$(cd packages/autoprofile && find test -name \'*.test.js\' -not -path \'*/node_modules/*\' | sort | tr \'\\n\' \' \')' },
  'core':                      { script: 'test:ci:core',                      displayName: 'core' },
  'metrics-util':              { script: 'test:ci:metrics-util',              displayName: 'metrics-util' },
  'opentelemetry-exporter':    { script: 'test:ci:opentelemetry-exporter',    displayName: 'opentelemetry-exporter' },
  'opentelemetry-sampler':     { script: 'test:ci:opentelemetry-sampler',     displayName: 'opentelemetry-sampler' },
  'serverless':                { script: 'test:ci:serverless',                displayName: 'serverless' },
  'serverless-collector':      { script: 'test:ci:serverless-collector',      displayName: 'serverless-collector' },
  'shared-metrics':            { script: 'test:ci:shared-metrics',            displayName: 'shared-metrics' }
};

const GROUP_TARGETS = {
  'aws':          ['aws-lambda', 'aws-fargate'],
  'cloud':        ['aws-lambda', 'aws-fargate', 'azure-container-services', 'google-cloud-run'],
  'opentelemetry':['opentelemetry-exporter', 'opentelemetry-sampler'],
  'core-group':   ['core', 'metrics-util', 'serverless', 'serverless-collector', 'shared-metrics']
};

function generateOne(t) {
  if (t === 'default') {
    const prConfig = {
      version: '2',
      tasks: {
        'pr-code-checks': {
          steps: [
            { name: 'peer-review', when: 'false' },
            { name: 'unit-test', image: NODE_IMAGE, script: '#!/usr/bin/env bash\necho "General PR checks passed."' }
          ]
        }
      }
    };
    writeDefaultConfig(prConfig, toMainConfig(prConfig));

  } else if (t.startsWith('collector-currencies-')) {
    const group    = t.replace('collector-currencies-', '');
    const groupDir = path.join(CURRENCIES_DIR, group);
    if (!fs.existsSync(groupDir)) { console.error(`Unknown currency group: ${group}`); process.exit(1); }
    const folders     = findTestFolders(groupDir);
    const tasks       = folders.map(({ pkgName, folder }) => buildCurrencyTask(pkgName, folder, group));
    const fanOutTasks = {};
    tasks.forEach(({ taskName, task }) => { fanOutTasks[taskName] = task; });
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));

  } else if (t === 'collector-metrics' || t === 'collector-misc') {
    const subDir = t.replace('collector-', '');
    const relDir = `test/integration/${subDir}`;
    const scriptLines = [
      '#!/usr/bin/env bash', 'set -eo pipefail', '',
      nodeVersionSwitchScript(), '',
      'cd "$WORKSPACE/$(load_repo app-repo path)"',
      'npm install --loglevel warn --foreground-scripts',
      'node bin/create-version-test-folders.js', '',
      '# collect test files',
      `TEST_FILES=$(cd packages/collector && find \\`,
      `  ${relDir} \\`,
      `  -name '*.test.js' \\`,
      `  -not -path '*/node_modules/*' \\`,
      `  | sort | tr '\\n' ' ')`,
      '', 'if [ -z "$TEST_FILES" ]; then',
      `  echo 'WARNING: No test files found for ${t} — skipping.'`,
      '  exit 0', 'fi', '',
      'exec env -i \\', '  PATH="$PATH" \\', '  HOME="$HOME" \\',
      '  CI=true \\', '  TEST_FILES="$TEST_FILES" \\',
      '  npm run test:ci:collector'
    ].join('\n');
    const fanOutTasks = {
      [`pr-code-checks-${t}`]: {
        from: 'pr-code-checks', displayName: t, runtimeClassName: 'large',
        steps: [
          { name: 'peer-review', when: 'false' },
          { name: 'detect-secrets', when: 'false' },
          { name: 'compliance-checks', when: 'false' },
          { name: 'unit-test', displayName: t, image: NODE_IMAGE, script: scriptLines }
        ]
      }
    };
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));

  } else if (GROUP_TARGETS[t]) {
    const members     = GROUP_TARGETS[t];
    const fanOutTasks = {};
    for (const member of members) {
      const { script, displayName, extraEnv } = SIMPLE_TARGETS[member];
      fanOutTasks[`pr-code-checks-${member}`] = buildSimpleTask(displayName, script, [], extraEnv);
    }
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));

  } else if (SIMPLE_TARGETS[t]) {
    const { script, displayName, extraEnv } = SIMPLE_TARGETS[t];
    const fanOutTasks = { [`pr-code-checks-${t}`]: buildSimpleTask(displayName, script, [], extraEnv) };
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));

  } else {
    console.error(`Unknown target: ${t}`);
    process.exit(1);
  }
}

// ─── run ─────────────────────────────────────────────────────────────────────

const targets = TARGET ? [TARGET] : ALL_TARGETS;
for (const t of targets) generateOne(t);
