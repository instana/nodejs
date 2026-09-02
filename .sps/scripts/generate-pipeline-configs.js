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

const sidecarsData = require('../assets/docker-services.json');

// ─── CLI ─────────────────────────────────────────────────────────────────────

const whatArg = process.argv.find(a => a.startsWith('--what='));
const nodeArg = process.argv.find(a => a.startsWith('--node-version='));
const modeArg = process.argv.find(a => a.startsWith('--mode='));

const MODE = modeArg ? modeArg.split('=')[1] : 'all'; // 'all' | 'pr' | 'main' | 'manual'
if (!['all', 'pr', 'main', 'manual'].includes(MODE)) {
  console.error(`Unknown --mode: ${MODE}. Use 'all', 'pr', 'main' or 'manual'.`);
  process.exit(1);
}

// All targets to generate when --what is omitted
const ALL_CURRENCY_GROUPS = fs.readdirSync(CURRENCIES_DIR).map(g => `collector-currencies-${g}`);
const ALL_SIMPLE_TARGETS = [
  'collector-metrics',
  'collector-misc',
  'cloud',
  'autoprofile',
  'core-group',
  'opentelemetry'
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

  if (s.platform) {
    lines.push(`  --platform ${s.platform}`);
  }

  if (s.privileged) {
    lines.push(`  --privileged`);
  }

  if (s.tmpfs) {
    for (const t of s.tmpfs) {
      lines.push(`  --tmpfs ${t}`);
    }
  }

  if (s.volumes) {
    for (const v of s.volumes) {
      lines.push(`  -v ${v}`);
    }
  }

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

  switch (name) {
    case 'elasticsearch':
      return (
        'echo "Waiting for Elasticsearch to be ready..."\n' +
        'timeout 120 bash -c \\\n' +
        '  \'until curl -sf http://127.0.0.1:9200/_cluster/health | grep -q \'\\\'\'"status":"green"\\|"status":"yellow"\'\\\'\' ; do sleep 3; done\'\n' +
        'echo "Elasticsearch is ready."\n' +
        "# Ensure 'localhost' resolves to 127.0.0.1 so the two-hosts test can connect\n" +
        "grep -qxF '127.0.0.1 localhost' /etc/hosts || echo '127.0.0.1 localhost' >> /etc/hosts"
      );
    case 'oracledb':
      // No shell-level readiness wait: oracle-app.js retries the connection every 5 s
      // indefinitely. The container is started before npm install (preStart) so it has
      // ~60-120 s to boot before the test runner reaches the app startup phase.
      // INSTANA_CONNECT_ORACLEDB is injected via extraEnvLines so the app knows the host.
      return '';
    case 'rabbitmq':
      return 'timeout 120 bash -c \\\n' + "  'until nc -z 127.0.0.1 5672 2>/dev/null; do sleep 2; done'";
    case 'kafka':
      // kafka readiness is handled by kafka-topics sidecar; just wait for port
      return 'timeout 120 bash -c \\\n' + "  'until nc -z 127.0.0.1 9092 2>/dev/null; do sleep 3; done'";
    case 'kafka-topics':
      // give the detached topic-creation container time to finish
      // 120s: kafka port opens before it is fully ready, topics creation can take >60s on slow CI
      return 'sleep 120';
    case 'zookeeper':
      return 'timeout 60 bash -c \\\n' + "  'until nc -z 127.0.0.1 2181 2>/dev/null; do sleep 2; done'";
    case 'postgres':
      return (
        'timeout 60 bash -c \\\n' +
        "  'until docker exec postgres pg_isready -h 127.0.0.1 -U node 2>/dev/null; do sleep 2; done'"
      );
    case 'mysql':
      return (
        'timeout 60 bash -c \\\n' +
        '  \'until docker exec mysql mysql -h 127.0.0.1 -u node -pnodepw -e "SELECT 1" 2>/dev/null; do sleep 2; done\''
      );
    case 'mongodb':
      return (
        'timeout 60 bash -c \\\n' +
        '  \'until docker exec mongodb mongosh --quiet --eval "db.runCommand({ ping: 1 })" 2>/dev/null | grep -q ok; do sleep 2; done\''
      );
    case 'redis':
      return (
        'timeout 30 bash -c \\\n' +
        "  'until docker exec redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done'"
      );
    case 'localstack':
      return 'timeout 60 bash -c \\\n' + "  'until nc -z 127.0.0.1 4566 2>/dev/null; do sleep 2; done'";
    case 'pubsub-emulator':
      return 'timeout 60 bash -c \\\n' + "  'until nc -z 127.0.0.1 8085 2>/dev/null; do sleep 2; done'";
    case 'fake-gcs-server':
      return (
        'timeout 30 bash -c \\\n' + "  'until curl -sf http://127.0.0.1:4443/storage/v1/b >/dev/null; do sleep 2; done'"
      );
    default:
      if (s.readinessProbe) {
        const probe = s.readinessProbe;
        if (probe.tcpSocket) {
          const port = probe.tcpSocket.port;
          return `timeout 60 bash -c \\\n` + `  'until nc -z 127.0.0.1 ${port} 2>/dev/null; do sleep 2; done'`;
        }
        if (probe.httpGet) {
          const port = probe.httpGet.port;
          const path = probe.httpGet.path || '/';
          return (
            `timeout 60 bash -c \\\n` +
            `  'until curl -sf http://127.0.0.1:${port}${path} >/dev/null; do sleep 2; done'`
          );
        }
      }
      return 'sleep 60';
  }
}

function readNeeds(folder) {
  const needsPath = path.join(folder, '.needs');
  if (!fs.existsSync(needsPath)) return [];
  return fs
    .readFileSync(needsPath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
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

/**
 * Emits a retry-wrapped test run (up to 2 attempts, matching Tekton behaviour).
 */
function runWithRetryLines(npmScript, envLines = []) {
  return [
    'retry=1',
    'while [ $retry -le 2 ]; do',
    '  LAST_EXIT=0',
    `  env -i \\`,
    '    PATH="$PATH" \\',
    '    HOME="$HOME" \\',
    '    CI=true \\',
    ...envLines.map(l => `    ${l}`),
    `    npm run ${npmScript} || LAST_EXIT=$?`,
    '  if [ $LAST_EXIT -eq 0 ]; then',
    '    break',
    '  fi',
    '  echo "Attempt $retry failed with exit code $LAST_EXIT — retrying..."',
    '  retry=$((retry + 1))',
    'done',
    'exit $LAST_EXIT'
  ];
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

  // Services marked preStart in docker-services.json must be started before npm install
  // so they have time to initialise (e.g. Oracle Free takes up to 2 min to register FREEPDB1).
  const preStartNeeds = needs.filter(n => sidecar(n)?.preStart);
  const normalNeeds = needs.filter(n => !sidecar(n)?.preStart);

  const scriptLines = ['#!/usr/bin/env bash', 'set -eo pipefail', ''];
  scriptLines.push(nodeVersionSwitchScript());
  scriptLines.push('');
  scriptLines.push('cd "$WORKSPACE/$(load_repo app-repo path)"');

  if (needs.length > 0) {
    scriptLines.push('# install docker client');
    scriptLines.push(dockerClientInstallScript());
    scriptLines.push('');
  }

  // Start slow-to-initialise services early so they boot during npm install
  if (preStartNeeds.length > 0) {
    for (const need of preStartNeeds) {
      scriptLines.push(`# start ${need} early — initialises during npm install`);
      scriptLines.push(dockerRunScript(need));
      scriptLines.push('');
    }
  }

  scriptLines.push('npm install --loglevel warn --foreground-scripts');
  scriptLines.push('node bin/create-version-test-folders.js');
  scriptLines.push('');

  if (needs.length > 0) {
    // Wait for pre-start services now that npm install has given them time to boot
    for (const need of preStartNeeds) {
      const wait = readinessScript(need);
      if (wait) {
        scriptLines.push(wait);
        scriptLines.push('');
      }
    }
    for (const need of normalNeeds) {
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
  const extraEnvLines = [];
  if (needs.includes('oracledb')) extraEnvLines.push('INSTANA_CONNECT_ORACLEDB="127.0.0.1:1521" \\');
  if (needs.includes('localstack')) extraEnvLines.push('INSTANA_CONNECT_LOCALSTACK_AWS="http://127.0.0.1:4566" \\');
  if (needs.includes('azurite'))
    extraEnvLines.push('INSTANA_CONNECT_AZURE_BLOB_ENDPOINT="http://127.0.0.1:10000/devstoreaccount1" \\');
  if (needs.includes('pubsub-emulator')) {
    extraEnvLines.push('INSTANA_CONNECT_PUBSUB_EMULATOR_HOST="127.0.0.1:8085" \\');
    extraEnvLines.push('GCP_PROJECT="test-project" \\');
  }
  if (needs.includes('fake-gcs-server')) {
    extraEnvLines.push('INSTANA_CONNECT_GCS_EMULATOR_HOST="http://127.0.0.1:4443" \\');
    extraEnvLines.push('GCP_PROJECT="test-project" \\');
    extraEnvLines.push('GCS_SERVICE_ACCOUNT_EMAIL="test-service-account@test-project.iam.gserviceaccount.com" \\');
  }
  extraEnvLines.push('TEST_FILES="$TEST_FILES" \\');
  scriptLines.push(...runWithRetryLines('test:ci:collector', extraEnvLines));

  const prefix = MODE === 'main' ? 'code-build' : 'pr-code-checks';
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
        },
        { name: 'sign-artifact', when: 'false' },
        { name: 'build-artifact', when: 'false' },
        { name: 'scan-artifact', when: 'false' }
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

  const simpleEnvLines = [];
  if (needs.includes('localstack')) simpleEnvLines.push('INSTANA_CONNECT_LOCALSTACK_AWS="http://127.0.0.1:4566" \\');
  if (extraEnv) {
    const varName = extraEnv.split('=')[0];
    simpleEnvLines.push(`${varName}="$${varName}" \\`);
  }
  scriptLines.push(...runWithRetryLines(testScript, simpleEnvLines));

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
      },
      { name: 'sign-artifact', when: 'false' },
      { name: 'build-artifact', when: 'false' },
      { name: 'scan-artifact', when: 'false' }
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
          },
          { name: 'sign-artifact', when: 'false' },
          { name: 'build-artifact', when: 'false' },
          { name: 'scan-artifact', when: 'false' }
        ]
      },
      'code-pr-finish': { steps: [{ name: 'run-stage', when: 'false' }] },
      'code-ci-finish': { steps: [{ name: 'run-stage', when: 'false' }] },
      'deploy-checks': { when: false },
      'deploy-release': { when: false },
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
  if (MODE === 'all' || MODE === 'pr') write(path.join(spsDir, 'pr', `pipeline-config-${name}.yaml`), prConfig);
  if (MODE === 'all' || MODE === 'main') write(path.join(spsDir, 'main', `pipeline-config-${name}.yaml`), mainConfig);
  if (MODE === 'all' || MODE === 'manual')
    write(path.join(spsDir, 'manual', `pipeline-config-${name}.yaml`), mainConfig);
}

function writeDefaultConfig(prConfig, mainConfig) {
  const spsDir = path.join(__dirname, '..');
  function write(filePath, config) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const output = yaml.dump(config, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    fs.writeFileSync(filePath, output);
    console.log(`Written: ${filePath}`);
  }
  if (MODE === 'all' || MODE === 'pr') write(path.join(spsDir, 'pr', 'pipeline-config.yaml'), prConfig);
  if (MODE === 'all' || MODE === 'main') write(path.join(spsDir, 'main', 'pipeline-config.yaml'), mainConfig);
  if (MODE === 'all' || MODE === 'manual') write(path.join(spsDir, 'manual', 'pipeline-config.yaml'), mainConfig);
  if (MODE === 'all') write(path.join(spsDir, 'pipeline-config.yaml'), prConfig);
}

// Convert a pr config to a main config by swapping pr-code-checks → code-build task names
function toMainConfig(prConfig) {
  const raw = yaml.dump(prConfig, { lineWidth: -1 });
  const main = raw.replace(/\bpr-code-checks\b/g, 'code-build');
  return yaml.load(main);
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

const SIMPLE_TARGETS = {
  'aws-lambda': { script: 'test:ci:aws-lambda', displayName: 'aws-lambda', needs: ['localstack'] },
  'aws-fargate': { script: 'test:ci:aws-fargate', displayName: 'aws-fargate' },
  'azure-container-services': { script: 'test:ci:azure-container-services', displayName: 'azure-container-services' },
  'google-cloud-run': { script: 'test:ci:google-cloud-run', displayName: 'google-cloud-run' },
  autoprofile: {
    script: 'test:ci:autoprofile',
    displayName: 'autoprofile',
    extraEnv:
      "CI_AUTOPROFILE_TEST_FILES=$(cd packages/autoprofile && find test -name '*.test.js' -not -path '*/node_modules/*' | sort | tr '\\n' ' ')"
  },
  core: { script: 'test:ci:core', displayName: 'core' },
  'metrics-util': { script: 'test:ci:metrics-util', displayName: 'metrics-util' },
  'opentelemetry-exporter': { script: 'test:ci:opentelemetry-exporter', displayName: 'opentelemetry-exporter' },
  'opentelemetry-sampler': { script: 'test:ci:opentelemetry-sampler', displayName: 'opentelemetry-sampler' },
  serverless: { script: 'test:ci:serverless', displayName: 'serverless' },
  'serverless-collector': { script: 'test:ci:serverless-collector', displayName: 'serverless-collector' },
  'shared-metrics': { script: 'test:ci:shared-metrics', displayName: 'shared-metrics' }
};

const GROUP_TARGETS = {
  aws: ['aws-lambda', 'aws-fargate'],
  cloud: ['aws-lambda', 'aws-fargate', 'azure-container-services', 'google-cloud-run'],
  opentelemetry: ['opentelemetry-exporter', 'opentelemetry-sampler'],
  'core-group': ['core', 'metrics-util', 'serverless', 'serverless-collector', 'shared-metrics']
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
        },
        'code-pr-finish': { steps: [{ name: 'run-stage', when: 'false' }] },
        'sign-artifact': { when: 'false' },
        'deploy-checks': { when: 'false' },
        'deploy-release': { when: 'false' },
        'code-ci-finish': { steps: [{ name: 'run-stage', when: 'false' }] }
      }
    };

    const mainConfig = {
      version: '2',
      tasks: {
        'code-build': {
          steps: [
            { name: 'peer-review', when: 'false' },
            { name: 'unit-test', image: NODE_IMAGE, script: '#!/usr/bin/env bash\necho "General PR checks passed."' },
            { name: 'sign-artifact', when: 'false' },
            { name: 'build-artifact', when: 'false' },
            { name: 'scan-artifact', when: 'false' }
          ]
        },
        'sign-artifact': { when: 'false' },
        'deploy-checks': { when: 'false' },
        'deploy-release': { when: 'false' },
        'code-ci-finish': { steps: [{ name: 'run-stage', when: 'false' }] }
      }
    };
    writeDefaultConfig(prConfig, mainConfig);
  } else if (t.startsWith('collector-currencies-')) {
    const group = t.replace('collector-currencies-', '');
    const groupDir = path.join(CURRENCIES_DIR, group);
    if (!fs.existsSync(groupDir)) {
      console.error(`Unknown currency group: ${group}`);
      process.exit(1);
    }
    const folders = findTestFolders(groupDir);
    const tasks = folders.map(({ pkgName, folder }) => buildCurrencyTask(pkgName, folder, group));
    const fanOutTasks = {};
    tasks.forEach(({ taskName, task }) => {
      fanOutTasks[taskName] = task;
    });
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (t === 'collector-metrics') {
    const relDir = 'test/integration/metrics';
    const scriptLines = [
      '#!/usr/bin/env bash',
      'set -eo pipefail',
      '',
      nodeVersionSwitchScript(),
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
      `  echo 'WARNING: No test files found for collector-metrics — skipping.'`,
      '  exit 0',
      'fi',
      '',
      ...runWithRetryLines('test:ci:collector', ['TEST_FILES="$TEST_FILES" \\'])
    ].join('\n');
    const fanOutTasks = {
      'pr-code-checks-collector-metrics': {
        from: 'pr-code-checks',
        displayName: 'collector-metrics',
        runtimeClassName: 'large',
        steps: [
          { name: 'peer-review', when: 'false' },
          { name: 'detect-secrets', when: 'false' },
          { name: 'compliance-checks', when: 'false' },
          { name: 'unit-test', displayName: 'collector-metrics', image: NODE_IMAGE, script: scriptLines }
        ]
      }
    };
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (t === 'collector-misc') {
    // Split into 4 parallel fan-out tasks to reduce per-task run time.
    //
    // misc-1:    sdk, actions, tracing/otel  (15 tests)
    // misc-2:    esm/cjs, typescript, module format, context  (15 tests)
    // misc-3:    agent behaviour, lifecycle  (13 tests)
    // misc-dind: directories with a .needs file (require Docker / DinD)
    const miscDir = path.join(REPO_ROOT, 'packages/collector/test/integration/misc');
    const dindFolders = fs.existsSync(miscDir)
      ? fs
          .readdirSync(miscDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && fs.existsSync(path.join(miscDir, e.name, '.needs')))
          .map(e => e.name)
      : [];
    const dindExcludes = dindFolders;

    const splits = [
      {
        name: 'misc-1',
        displayName: 'collector-misc-1',
        dirs: [
          'test/integration/misc/sdk',
          'test/integration/misc/actions',
          'test/integration/misc/open_tracing',
          'test/integration/misc/otel_sdk_and_instana',
          'test/integration/misc/otlp-exporter',
          'test/integration/misc/tracing_metrics',
          'test/integration/misc/w3c_trace_context',
          'test/integration/misc/specification_compliance'
        ]
      },
      {
        name: 'misc-2',
        displayName: 'collector-misc-2',
        dirs: [
          'test/integration/misc/native_esm',
          'test/integration/misc/require-esm',
          'test/integration/misc/cjs-via-esm',
          'test/integration/misc/require_hook',
          'test/integration/misc/babel_typescript',
          'test/integration/misc/typescript',
          'test/integration/misc/native_module_retry',
          'test/integration/misc/cls-hooked-conflict',
          'test/integration/misc/common',
          'test/integration/misc/secrets',
          'test/integration/misc/stack_trace',
          'test/integration/misc/restore_context',
          'test/integration/misc/reinit_setLogger',
          'test/integration/misc/logger_spans'
        ]
      },
      {
        name: 'misc-3',
        displayName: 'collector-misc-3',
        dirs: [
          'test/integration/misc/activate_immediately',
          'test/integration/misc/agent-logs',
          'test/integration/misc/agent_connection',
          'test/integration/misc/disabled',
          'test/integration/misc/immediate',
          'test/integration/misc/invalid_app',
          'test/integration/misc/long_agent_communication',
          'test/integration/misc/long_profiling',
          'test/integration/misc/pre_init',
          'test/integration/misc/prevent_instrumenting_multiple_times',
          'test/integration/misc/too_late',
          'test/integration/misc/uncaught'
        ]
      }
    ];

    const fanOutTasks = {};

    // misc-1 / misc-2 / misc-3 — no Docker needed
    for (const split of splits) {
      // Filter out any dirs that turned out to have .needs (dind) — keep splits stable
      const dirs = split.dirs.filter(d => !dindExcludes.some(ex => d.endsWith(`/misc/${ex}`)));
      const findLines = dirs.map(d => `  ${d} \\`);
      const scriptLines = [
        '#!/usr/bin/env bash',
        'set -eo pipefail',
        '',
        nodeVersionSwitchScript(),
        '',
        'cd "$WORKSPACE/$(load_repo app-repo path)"',
        'npm install --loglevel warn --foreground-scripts',
        'node bin/create-version-test-folders.js',
        '',
        '# collect test files',
        'TEST_FILES=$(cd packages/collector && find \\',
        ...findLines,
        "  -name '*.test.js' \\",
        "  -not -path '*/node_modules/*' \\",
        "  | sort | tr '\\n' ' ')",
        '',
        'if [ -z "$TEST_FILES" ]; then',
        `  echo 'WARNING: No test files found for ${split.displayName} — skipping.'`,
        '  exit 0',
        'fi',
        '',
        ...runWithRetryLines('test:ci:collector', ['TEST_FILES="$TEST_FILES" \\'])
      ].join('\n');
      fanOutTasks[`pr-code-checks-${split.name}`] = {
        from: 'pr-code-checks',
        displayName: split.displayName,
        runtimeClassName: 'large',
        steps: [
          { name: 'peer-review', when: 'false' },
          { name: 'detect-secrets', when: 'false' },
          { name: 'compliance-checks', when: 'false' },
          { name: 'unit-test', displayName: split.displayName, image: NODE_IMAGE, script: scriptLines }
        ]
      };
    }

    // misc-dind — one combined task for all .needs folders (require Docker / DinD)
    if (dindFolders.length > 0) {
      const dindNeeds = [...new Set(dindFolders.flatMap(name => readNeeds(path.join(miscDir, name))))];
      const dindRelDirs = dindFolders.map(name => `test/integration/misc/${name}`);
      const findLines = dindRelDirs.map(d => `  ${d} \\`);

      const dindScriptLines = [
        '#!/usr/bin/env bash',
        'set -eo pipefail',
        '',
        nodeVersionSwitchScript(),
        '',
        'cd "$WORKSPACE/$(load_repo app-repo path)"',
        'npm install --loglevel warn --foreground-scripts',
        'node bin/create-version-test-folders.js',
        '',
        '# install docker client',
        dockerClientInstallScript(),
        ''
      ];
      for (const need of dindNeeds) {
        dindScriptLines.push(`# start ${need}`);
        dindScriptLines.push(dockerRunScript(need));
        const wait = readinessScript(need);
        if (wait) dindScriptLines.push(wait);
        dindScriptLines.push('');
      }
      dindScriptLines.push(
        '# collect test files',
        'TEST_FILES=$(cd packages/collector && find \\',
        ...findLines,
        "  -name '*.test.js' \\",
        "  -not -path '*/node_modules/*' \\",
        "  | sort | tr '\\n' ' ')",
        '',
        'if [ -z "$TEST_FILES" ]; then',
        "  echo 'WARNING: No test files found for collector-misc-dind — skipping.'",
        '  exit 0',
        'fi',
        '',
        ...runWithRetryLines('test:ci:collector', ['TEST_FILES="$TEST_FILES" \\'])
      );
      fanOutTasks['pr-code-checks-misc-dind'] = {
        from: 'pr-code-checks',
        displayName: 'collector-misc-dind',
        runtimeClassName: 'large',
        include: ['dind'],
        steps: [
          { name: 'peer-review', when: 'false' },
          { name: 'detect-secrets', when: 'false' },
          { name: 'compliance-checks', when: 'false' },
          {
            name: 'unit-test',
            displayName: 'collector-misc-dind',
            image: NODE_IMAGE,
            include: ['docker-socket'],
            script: dindScriptLines.join('\n')
          }
        ]
      };
    }

    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (GROUP_TARGETS[t]) {
    const members = GROUP_TARGETS[t];
    const fanOutTasks = {};
    for (const member of members) {
      const { script, displayName, needs = [], extraEnv } = SIMPLE_TARGETS[member];
      fanOutTasks[`pr-code-checks-${member}`] = buildSimpleTask(displayName, script, needs, extraEnv);
    }
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (SIMPLE_TARGETS[t]) {
    const { script, displayName, needs = [], extraEnv } = SIMPLE_TARGETS[t];
    const fanOutTasks = { [`pr-code-checks-${t}`]: buildSimpleTask(displayName, script, needs, extraEnv) };
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
