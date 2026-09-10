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
const DEFAULT_NODE_VERSION = fs.readFileSync(path.join(REPO_ROOT, '.nvmrc'), 'utf-8').trim();
const DEFAULT_NODE_MAJOR = DEFAULT_NODE_VERSION.split('.')[0];

const sidecarsData = require('../assets/docker-services.json');

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
  'collector-misc-and-unit',
  'cloud',
  'autoprofile',
  'core-group',
  'opentelemetry',
  'pr-general',
  'pr-verify',
  'upload-currency-report'
];
const ALL_TARGETS = ['default', ...ALL_CURRENCY_GROUPS, ...ALL_SIMPLE_TARGETS];

// 'manual' folder is identical to 'main' (ci-listener, code-build tasks)

const TARGET = whatArg ? whatArg.split('=')[1] : null;
const NODE_IMAGE = 'mirror.gcr.io/library/node:24';
const SIDECAR_NETWORK = 'offline-net';

function sidecar(name) {
  return sidecarsData.sidecars.find(s => s.name === name);
}

function dockerRunScript(name, options = {}) {
  const s = sidecar(name);
  if (!s) throw new Error(`Unknown sidecar: ${name}`);

  const lines = [`docker run -d --network ${options.network || SIDECAR_NETWORK} --name ${name}`];

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

function socatForwardScript(name) {
  const s = sidecar(name);
  if (!s || !s.ports || s.ports.length === 0) return '';
  const varName = `SIDECAR_IP`;
  const lines = [`${varName}=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${name})`];
  for (const p of s.ports) {
    const [hostPort, containerPort] = p.split(':');
    lines.push(`socat TCP-LISTEN:${hostPort},fork,reuseaddr,bind=127.0.0.1 TCP:$${varName}:${containerPort} &`);
  }
  return lines.join('\n');
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
        'echo "Elasticsearch is ready."'
      );
    case 'oracledb':
      // Wait until FREEPDB1 registers with the Oracle listener.
      // grep -qi: case-insensitive — gvenzl image reports "freepdb1" (lowercase).
      return [
        'echo "Waiting for Oracle FREEPDB1..."',
        'timeout 180 bash -c \\',
        '  \'until docker exec oracledb lsnrctl status 2>/dev/null | grep -qi "FREEPDB1"; do sleep 5; done\'',
        'echo "Oracle FREEPDB1 is ready."'
      ].join('\n');
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
      return 'timeout 60 bash -c \\\n' + "  'until nc -z 127.0.0.1 5432 2>/dev/null; do sleep 2; done'";
    case 'mysql':
      return 'timeout 60 bash -c \\\n' + "  'until nc -z 127.0.0.1 3306 2>/dev/null; do sleep 2; done'";
    case 'mongodb':
      return 'timeout 60 bash -c \\\n' + "  'until nc -z 127.0.0.1 27017 2>/dev/null; do sleep 2; done'";
    case 'redis':
      return 'timeout 30 bash -c \\\n' + "  'until nc -z 127.0.0.1 6379 2>/dev/null; do sleep 1; done'";
    case 'redis-cluster':
      return 'timeout 30 bash -c \\\n' + "  'until nc -z 127.0.0.1 7000 2>/dev/null; do sleep 1; done'";
    case 'ibm_db':
      return (
        'timeout 300 bash -c \\\n' +
        '  \'until docker exec ibm_db bash -c "su - node -c \\"db2 connect to nodedb && db2 \\\\\\"select 1 from sysibm.sysdummy1\\\\\\"\\"" > /dev/null 2>&1; do sleep 5; done\''
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

/**
 * Generic collector task builder.
 * Produces the shell script and SPS task object for one pipeline step that
 * runs a subset of collector integration tests.
 *
 * @param {string}   taskSlug    - Unique slug appended to the task name prefix
 *                                 (e.g. "collector-metrics", "misc-1", "messaging-node-rdkafka-other")
 * @param {string}   displayName - Human-readable label shown in the SPS UI
 * @param {string[]} paths       - One or more paths relative to packages/collector that are
 *                                 passed as roots to `find … -name '*.test.js'`
 * @param {string[]} needs       - Sidecar names required by this task (from .needs)
 */
function buildCollectorTask(taskSlug, displayName, paths, needs, options = {}) {
  const scriptLines = ['#!/usr/bin/env bash', 'set -eo pipefail', ''];
  scriptLines.push(nodeVersionSwitchScript());
  scriptLines.push('');
  scriptLines.push('cd "$WORKSPACE/$(load_repo app-repo path)"');

  if (needs.length > 0) {
    scriptLines.push('# install docker client');
    scriptLines.push(dockerClientInstallScript());
    scriptLines.push('');
    scriptLines.push('# create isolated network');
    scriptLines.push(`docker network create --internal ${SIDECAR_NETWORK}`);
    scriptLines.push('');
  }

  if (needs.includes('oracledb')) {
    scriptLines.push('# start oracledb early — initialises during npm install');
    scriptLines.push(dockerRunScript('oracledb'));
    const socatOracle = socatForwardScript('oracledb');
    if (socatOracle) scriptLines.push(socatOracle);
    scriptLines.push('');
  }

  scriptLines.push('npm install --loglevel warn --foreground-scripts');
  scriptLines.push('');

  if (needs.length > 0) {
    for (const need of needs) {
      if (need === 'oracledb') {
        const wait = readinessScript(need);
        if (wait) {
          scriptLines.push(wait);
          scriptLines.push('');
        }
      } else {
        scriptLines.push(`# start ${need}`);
        if (need === 'localstack' && ['@aws-sdk/client-kinesis', 'aws-sdk'].includes(displayName)) {
          // LocalStack's Kinesis backend is downloaded and started lazily. Bootstrap it with
          // temporary egress, verify a real Kinesis operation, then isolate it for the tests.
          scriptLines.push('docker network create kinesis-bootstrap');
          scriptLines.push(dockerRunScript(need, { network: 'kinesis-bootstrap' }));
          scriptLines.push(`docker network connect ${SIDECAR_NETWORK} ${need}`);
          scriptLines.push('timeout 180 bash -c \\');
          scriptLines.push(
            `  'until docker exec ${need} awslocal kinesis list-streams >/dev/null 2>&1; do sleep 2; done'`
          );
          scriptLines.push(`docker network disconnect kinesis-bootstrap ${need}`);
          scriptLines.push('docker network rm kinesis-bootstrap');
        } else {
          scriptLines.push(dockerRunScript(need));
        }
        const socat = socatForwardScript(need);
        if (socat) scriptLines.push(socat);
        const wait = readinessScript(need);
        if (wait) scriptLines.push(wait);
        scriptLines.push('');
      }
    }
  }

  scriptLines.push('node bin/create-version-test-folders.js');
  scriptLines.push('');
  scriptLines.push('# collect test files');
  scriptLines.push(`TEST_FILES=$(cd packages/collector && find \\`);
  for (const p of paths) scriptLines.push(`  ${p} \\`);
  scriptLines.push(`  -name '*.test.js' \\`);
  scriptLines.push(`  -not -path '*/node_modules/*' \\`);
  scriptLines.push(`  | sort | tr '\\n' ' ')`);
  scriptLines.push('');
  scriptLines.push('if [ -z "$TEST_FILES" ]; then');
  scriptLines.push(`  echo 'WARNING: No test files found for ${displayName} — skipping.'`);
  scriptLines.push('  exit 0');
  scriptLines.push('fi');
  scriptLines.push('');

  const extraEnvLines = [];
  if (needs.includes('elasticsearch')) {
    extraEnvLines.push('INSTANA_CONNECT_ELASTICSEARCH="127.0.0.1:9200" \\');
    extraEnvLines.push('INSTANA_CONNECT_ELASTICSEARCH_ALTERNATIVE="localhost:9200" \\');
  }
  if (needs.includes('oracledb')) extraEnvLines.push('INSTANA_CONNECT_ORACLEDB="localhost:1521" \\');
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
  scriptLines.push(...runWithRetryLines(`coverage-ci --npm_command="test:ci:collector" --report_dir="${taskSlug}"`, extraEnvLines));
  scriptLines.push(...uploadTestFilesLines(taskSlug));
  scriptLines.push('exit $LAST_EXIT');

  const prefix = MODE === 'main' ? 'code-build' : 'pr-code-checks';
  // RFC 1123: lowercase only.
  const normalizedSlug = taskSlug.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const taskName = `${prefix}-${normalizedSlug}`;

  return {
    taskName,
    task: {
      from: MODE === 'main' ? 'code-build' : 'pr-code-checks',
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
    }
  };
}

/**
 * Read an optional `.split` marker from a currency package folder.
 *
 * Supported file contents:
 *
 *   <number>   Partition modes.json into that many roughly-equal groups.
 *              The simplest form — just write "4" to get 4 parallel tasks.
 *              If the number >= mode count each mode gets its own task.
 *
 *   true       One task per mode (all modes from modes.json, one each).
 *   (empty)    Same as true.
 *
 * Returns null       → no .split file; single task preserving original behaviour.
 * Returns string[][] → normalised groups of mode names to run per task.
 */
function readModeSplit(folder) {
  const splitPath = path.join(folder, '.split');
  if (!fs.existsSync(splitPath)) return null;

  const modesPath = path.join(folder, 'modes.json');
  if (!fs.existsSync(modesPath)) return null;
  const modes = JSON.parse(fs.readFileSync(modesPath, 'utf-8'));
  if (!Array.isArray(modes) || modes.length === 0) return null;

  const raw = fs.readFileSync(splitPath, 'utf-8').trim();
  const n = Number(raw);
  if (!isNaN(n) && n > 0) {
    const count = Math.min(Math.round(n), modes.length);
    const groups = [];
    const size = Math.ceil(modes.length / count);
    for (let i = 0; i < modes.length; i += size) {
      groups.push(modes.slice(i, i + size));
    }
    return groups;
  }

  console.error(`${splitPath}: unrecognised content "${raw}". Use a positive number (e.g. "4").`);
  process.exit(1);
}

function nodeVersionSwitchScript() {
  return [
    'node_version="${node_version:-$(get_env node-version "$(get_env NODE_VERSION "")")}"',
    'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash',
    'export NVM_DIR="$HOME/.nvm"',
    '# shellcheck source=/dev/null',
    '. "$NVM_DIR/nvm.sh"',
    'nvm install "$node_version" --no-progress',
    'nvm use "$node_version"',
    'echo "Node.js: $(node --version)"'
  ].join('\n');
}

function dockerClientInstallScript() {
  return [
    'CODENAME=$(. /etc/os-release; echo "$VERSION_CODENAME")',
    'ARCH=$(dpkg --print-architecture)',
    'apt-get update -qq && apt-get install -y -qq ca-certificates curl gnupg netcat-openbsd socat',
    'install -m 0755 -d /etc/apt/keyrings',
    'curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg',
    'chmod a+r /etc/apt/keyrings/docker.gpg',
    'echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${CODENAME} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
    'apt-get update -qq && apt-get install -y -qq docker-ce-cli',
    "timeout 30 bash -c 'until [ -S /var/run/docker.sock ]; do sleep 1; done'"
  ].join('\n');
}

function runEsmReadLines() {
  // Read RUN_ESM from the pipeline trigger property (injected by run-pipeline.sh --esm true).
  // Falls back to empty string if not set, so tests run normally by default.
  return ['RUN_ESM="$(get_env RUN_ESM "")"'];
}

function runWithRetryLines(npmScript, envLines = [], withEsm = true) {
  return [
    ...(withEsm ? runEsmReadLines() : []),
    'retry=1',
    'while [ $retry -le 2 ]; do',
    '  LAST_EXIT=0',
    `  env -i \\`,
    '    PATH="$PATH" \\',
    '    HOME="$HOME" \\',
    '    CI=true \\',
    ...(withEsm ? ['    RUN_ESM="$RUN_ESM" \\'] : []),
    ...envLines.map(l => `    ${l}`),
    `    npm run ${npmScript} || LAST_EXIT=$?`,
    '  if [ $LAST_EXIT -eq 0 ]; then',
    '    break',
    '  fi',
    '  echo "Attempt $retry failed with exit code $LAST_EXIT — retrying..."',
    '  retry=$((retry + 1))',
    'done'
  ];
}

function uploadLcovLines(taskSlug) {
  return [
    '',
    '# upload lcov coverage report to COS',
    `LCOV_FILE="coverage/${taskSlug}/lcov.info"`,
    'if [ -f "$LCOV_FILE" ] && [ -n "$COS_API_KEY" ] && [ -n "$GIT_COMMIT" ]; then',
    `  curl -sf -X PUT \\`,
    `    "${COS_ENDPOINT}/${COS_BUCKET}/test-results/\$GIT_COMMIT/coverage/${taskSlug}/lcov.info" \\`,
    '    -H "Authorization: Bearer $IAM_TOKEN" \\',
    '    -H "Content-Type: text/plain" \\',
    `    --data-binary @"\$LCOV_FILE" \\`,
    `    && echo "Uploaded lcov for ${taskSlug} → test-results/\$GIT_COMMIT/coverage/${taskSlug}/lcov.info" \\`,
    `    || echo "WARNING: Failed to upload lcov for ${taskSlug} (non-fatal)"`,
    'else',
    '  echo "WARNING: lcov file not found or credentials unavailable — skipping lcov upload"',
    'fi',
    ''
  ];
}

const COS_BUCKET = 'itp-nodejs-tracer-sps';
const COS_ENDPOINT = 'https://s3.eu-de.cloud-object-storage.appdomain.cloud';

function uploadTestFilesLines(taskSlug) {
  return [
    '',
    '# upload executed test files + lcov coverage report to COS',
    'COS_API_KEY="$(get_secret ibm-object-storage-api-key)"',
    'GIT_COMMIT="$(get_env HEAD_SHA "")"',
    'if [ -n "$COS_API_KEY" ] && [ -n "$GIT_COMMIT" ]; then',
    '  IAM_TOKEN=$(curl -sf -X POST "https://iam.cloud.ibm.com/identity/token" \\',
    '    -H "Content-Type: application/x-www-form-urlencoded" \\',
    '    -d "grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=$COS_API_KEY" \\',
    '    | grep -o \'"access_token":"[^"]*"\' | sed \'s/"access_token":"//;s/"//\')',
    `  curl -sf -X PUT \\`,
    `    "${COS_ENDPOINT}/${COS_BUCKET}/test-results/\$GIT_COMMIT/${taskSlug}.txt" \\`,
    '    -H "Authorization: Bearer $IAM_TOKEN" \\',
    '    -H "Content-Type: text/plain" \\',
    '    --data-binary "$(echo "$TEST_FILES" | tr \' \' \'\\n\' | sort)" \\',
    `    && echo "Uploaded test list for ${taskSlug} → test-results/\$GIT_COMMIT/${taskSlug}.txt" \\`,
    '    || echo "WARNING: Failed to upload test list for ' + taskSlug + ' (non-fatal)"',
    `  NODE_MAJOR="\${node_version%%.*}"`,
    `  if [ "\$NODE_MAJOR" != "${DEFAULT_NODE_MAJOR}" ]; then`,
    `    echo "Skip: lcov upload — not the development node major version (\$NODE_MAJOR != ${DEFAULT_NODE_MAJOR})"`,
    `  else`,
    `    LCOV_FILE="coverage/${taskSlug}/lcov.info"`,
    '    if [ -f "$LCOV_FILE" ]; then',
    `      curl -sf -X PUT \\`,
    `        "${COS_ENDPOINT}/${COS_BUCKET}/test-results/\$GIT_COMMIT/coverage/${taskSlug}/lcov.info" \\`,
    '        -H "Authorization: Bearer $IAM_TOKEN" \\',
    '        -H "Content-Type: text/plain" \\',
    `        --data-binary @"\$LCOV_FILE" \\`,
    `        && echo "Uploaded lcov for ${taskSlug} → test-results/\$GIT_COMMIT/coverage/${taskSlug}/lcov.info" \\`,
    `        || echo "WARNING: Failed to upload lcov for ${taskSlug} (non-fatal)"`,
    '    else',
    `      echo "WARNING: lcov not found at \$LCOV_FILE — skipping lcov upload"`,
    '    fi',
    '  fi',
    'else',
    '  echo "WARNING: COS credentials or git commit unavailable — skipping uploads"',
    'fi',
    ''
  ];
}

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

/**
 * Build one or more collector task entries for a currency package.
 *
 * Without .split → one task, find roots at the package folder.
 * With .split    → one task per mode group; find roots are the per-mode
 *                  subdirectory paths derived from the mode name
 *                  (create-version-test-folders.js generates _v<ver>/<mode>/<mode>.test.js).
 *
 * Returns an array of { taskName, task } objects.
 */
function buildCurrencyTasks(pkgName, folder, group) {
  const needs = readNeeds(folder);
  const relFolder = path.relative(REPO_ROOT, folder).replace(/\\/g, '/');
  const relCollectorFolder = relFolder.replace('packages/collector/', '');
  // slug: for scoped packages (@scope/name) use only the package name part to keep slugs short;
  // for unscoped, use the full name. Then normalise dots/underscores to hyphens.
  const baseName = pkgName.includes('/') && pkgName.startsWith('@') ? pkgName.split('/')[1] : pkgName.replace(/@/g, '');
  const pkgSlug = baseName.replace(/[./_]/g, '-');

  const modeGroups = readModeSplit(folder); // null when no .split

  if (!modeGroups) {
    // Single task — all test files under the package folder
    return [buildCollectorTask(`collector-${group}-${pkgSlug}`, pkgName, [relCollectorFolder], needs)];
  }

  // Fan-out — one task per mode group, numbered 1..N.
  // Mode test files live at _v<ver>/<mode>/ — pass those dirs as find roots
  // so -name '*.test.js' picks up exactly the right tests with no extra filters.
  return modeGroups.map((modes, i) => {
    const index = i + 1;
    const displayName = `${pkgName}-${index}`;
    const modeDirs = fs.existsSync(folder)
      ? fs
          .readdirSync(folder)
          .filter(e => e.startsWith('_v'))
          .flatMap(v => modes.map(m => `${relCollectorFolder}/${v}/${m}`))
      : [relCollectorFolder];

    return buildCollectorTask(`collector-${group}-${pkgSlug}-${index}`, displayName, modeDirs, needs);
  });
}

function buildSimpleTask(taskSlug, displayName, testScript, needs = [], extraEnv = null, supportsEsm = false) {
  const scriptLines = ['#!/usr/bin/env bash', 'set -eo pipefail', ''];
  scriptLines.push(nodeVersionSwitchScript());
  scriptLines.push('');
  scriptLines.push('cd "$WORKSPACE/$(load_repo app-repo path)"');
  scriptLines.push('npm install --loglevel warn --foreground-scripts');
  scriptLines.push('');
  scriptLines.push('# collect test files');
  scriptLines.push(
    `TEST_FILES=$(cd packages/${taskSlug} && find test -name '*test.js' -not -path '*/node_modules/*' | sort | tr '\\n' ' ')`
  );
  scriptLines.push('');

  if (needs.length > 0) {
    scriptLines.push('# install docker client');
    scriptLines.push(dockerClientInstallScript());
    scriptLines.push('');
    scriptLines.push('# create isolated network (no internet access)');
    scriptLines.push(`docker network create --internal ${SIDECAR_NETWORK}`);
    scriptLines.push('');
    for (const need of needs) {
      scriptLines.push(`# start ${need}`);
      scriptLines.push(dockerRunScript(need));
      const socat = socatForwardScript(need);
      if (socat) scriptLines.push(socat);
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
  // Only forward RUN_ESM for packages whose test hooks understand it (i.e. use
  // packages/collector/test/hooks.js with checkESMApp). Simple-target packages
  // have no such hook and would run all tests unconditionally regardless of the
  // flag, producing incorrect results when RUN_ESM is set.
  scriptLines.push(...runWithRetryLines(`coverage-ci --npm_command="${testScript}" --report_dir="${taskSlug}"`, simpleEnvLines, supportsEsm));
  scriptLines.push(...uploadTestFilesLines(taskSlug));
  scriptLines.push('exit $LAST_EXIT');

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

function buildGeneralTasks() {
  const prefix = MODE === 'main' ? 'code-build' : 'pr-code-checks';
  const rootTask = prefix;

  function task(displayName, cmd) {
    const script = [
      '#!/usr/bin/env bash',
      'set -eo pipefail',
      '',
      nodeVersionSwitchScript(),
      '',
      'cd "$WORKSPACE/$(load_repo app-repo path)"',
      'npm install --loglevel warn --foreground-scripts',
      '',
      cmd
    ].join('\n');

    return {
      from: rootTask,
      displayName,
      runtimeClassName: 'large',
      steps: [
        { name: 'peer-review', when: 'false' },
        { name: 'detect-secrets', when: 'false' },
        { name: 'compliance-checks', when: 'false' },
        { name: 'unit-test', displayName, image: NODE_IMAGE, script },
        { name: 'sign-artifact', when: 'false' },
        { name: 'build-artifact', when: 'false' },
        { name: 'scan-artifact', when: 'false' }
      ]
    };
  }

  const echoEnvScript = [
    '#!/usr/bin/env bash',
    'set -eo pipefail',
    '',
    '# ── Read trigger parameters ───────────────────────────────────────────────',
    'node_version="${node_version:-$(get_env node-version "$(get_env NODE_VERSION "")")}"',
    'RUN_ESM="$(get_env RUN_ESM "")"',
    '',
    'echo "Trigger params:"',
    'echo "  node-version = ${node_version}"',
    'echo "  RUN_ESM      = ${RUN_ESM:-<not set>}"',
    'echo ""',
    '',
    '# ── Switch to the requested Node version via nvm ──────────────────────────',
    'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash',
    'export NVM_DIR="$HOME/.nvm"',
    '# shellcheck source=/dev/null',
    '. "$NVM_DIR/nvm.sh"',
    'nvm install "$node_version" --no-progress',
    'nvm use "$node_version"',
    '',
    'cd "$WORKSPACE/$(load_repo app-repo path)"',
    '',
    '# ── Runtime versions ──────────────────────────────────────────────────────',
    'echo "Using node:    $(node --version 2>/dev/null || echo \'Node.js not found\')"',
    'echo "Using npm:     $(npm --version 2>/dev/null || echo \'NPM not found\')"',
    'echo "Architecture:  $(node -p \'process.arch\' 2>/dev/null || echo \'Unknown\')"',
    '',
    '# ── ESM support ───────────────────────────────────────────────────────────',
    'if [ -n "$RUN_ESM" ] && [ "$RUN_ESM" = "true" ]; then',
    '  echo "ESM mode:      enabled (RUN_ESM=true)"',
    'else',
    '  echo "ESM mode:      disabled (RUN_ESM not set)"',
    'fi',
    '',
    'echo "Python3 version: $(python3 --version 2>/dev/null | head -n 1 || echo \'Python3 not found\')"',
    'echo "Make version:    $(make --version 2>/dev/null | head -n 1 || echo \'Make not found\')"',
    'echo "GCC version:     $(gcc --version 2>/dev/null | head -n 1 || echo \'GCC not found\')"',
    'echo "Node-gyp:        $(node-gyp --version 2>/dev/null || echo \'Node-gyp not found\')"',
    'echo ""',
    'echo "NPM config list:"',
    'npm config list'
  ].join('\n');

  const echoEnvTaskName = `${prefix}-echo-env`;

  return {
    [echoEnvTaskName]: {
      from: rootTask,
      displayName: 'echo-env',
      runtimeClassName: 'large',
      steps: [
        { name: 'peer-review', when: 'false' },
        { name: 'detect-secrets', when: 'false' },
        { name: 'compliance-checks', when: 'false' },
        { name: 'unit-test', displayName: 'echo-env', image: NODE_IMAGE, script: echoEnvScript },
        { name: 'sign-artifact', when: 'false' },
        { name: 'build-artifact', when: 'false' },
        { name: 'scan-artifact', when: 'false' }
      ]
    },
    [`${prefix}-audit`]:       task('audit',       'npm run audit'),
    [`${prefix}-lint`]:        task('lint',        'npm run lint'),
    [`${prefix}-commitlint`]:  task('commitlint',  'npm run commitlint'),
    [`${prefix}-depcheck`]:    task('depcheck',    'npm run depcheck')
  };
}

function buildSonarTask(rootTask = 'pr-code-checks') {
  const isPR = rootTask === 'pr-code-checks';

  // Lines shared between PR and main: fetch IAM token + download all lcov reports from COS
  const downloadLcovLines = [
    '# ── Download lcov coverage reports from COS ──────────────────────────────',
    'node_version="${node_version:-$(get_env node-version "$(get_env NODE_VERSION "")")}"',
    `NODE_MAJOR="\${node_version%%.*}"`,
    `if [ "\$NODE_MAJOR" != "${DEFAULT_NODE_MAJOR}" ]; then`,
    `  echo "Skip: sonar lcov download — not the development node major version (\$NODE_MAJOR != ${DEFAULT_NODE_MAJOR})"`,
    'else',
    'COS_API_KEY="$(get_secret ibm-object-storage-api-key)"',
    'GIT_COMMIT="$(get_env HEAD_SHA "")"',
    'LCOV_PATHS=""',
    'if [ -n "$COS_API_KEY" ] && [ -n "$GIT_COMMIT" ]; then',
    '  IAM_TOKEN=$(curl -sf -X POST "https://iam.cloud.ibm.com/identity/token" \\',
    '    -H "Content-Type: application/x-www-form-urlencoded" \\',
    '    -d "grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=$COS_API_KEY" \\',
    '    | grep -o \'"access_token":"[^"]*"\' | sed \'s/"access_token":"//;s/"//\')',
    `  PREFIX="test-results/\$GIT_COMMIT/coverage"`,
    `  SLUGS=$(curl -sf \\`,
    `    "${COS_ENDPOINT}/${COS_BUCKET}?prefix=\$PREFIX/&delimiter=/" \\`,
    '    -H "Authorization: Bearer $IAM_TOKEN" \\',
    '    | grep -oP \'(?<=<Prefix>)[^<]+(?=</Prefix>)\' \\',
    '    | grep -v "^$PREFIX/$" \\',
    '    | sed "s|$PREFIX/||;s|/||")',
    '  mkdir -p coverage',
    '  for SLUG in $SLUGS; do',
    '    mkdir -p "coverage/$SLUG"',
    `    curl -sf \\`,
    `      "${COS_ENDPOINT}/${COS_BUCKET}/\$PREFIX/\$SLUG/lcov.info" \\`,
    '      -H "Authorization: Bearer $IAM_TOKEN" \\',
    '      -o "coverage/$SLUG/lcov.info" \\',
    '      && echo "  ✔ downloaded lcov for $SLUG" \\',
    '      || echo "  – no lcov for $SLUG (skipping)"',
    '  done',
    '  LCOV_PATHS=$(find coverage -name "lcov.info" | tr \'\\n\' \',\' | sed \'s/,$//\')',
    '  echo "LCOV_PATHS=$LCOV_PATHS"',
    'else',
    '  echo "WARNING: COS credentials or git commit unavailable — skipping lcov download"',
    'fi',
    'fi',
    '',
  ].join('\n');

  const script = isPR
    ? [
        '#!/usr/bin/env bash',
        'set -eo pipefail',
        '',
        'SONAR_TOKEN="$(get_secret sonar-token)"',
        'if [ -z "$SONAR_TOKEN" ]; then',
        '  echo "ERROR: sonar-token pipeline property is not set — skipping Sonar analysis."',
        '  exit 1',
        'fi',
        '',
        'GH_TOKEN="$(get_secret gh-public-token)"',
        'GIT_COMMIT="$(get_env HEAD_SHA "")"',
        'REPO="instana/nodejs"',
        '',
        '# ── Wait for pr-verify to complete ───────────────────────────────────────',
        'echo "Waiting for pr-code-checks-verify to complete..."',
        'MAX_WAIT=3600',
        'POLL_INTERVAL=30',
        'ELAPSED=0',
        'while true; do',
        '  STATE=$(curl -sf \\',
        '    -H "Authorization: Bearer $GH_TOKEN" \\',
        '    -H "Accept: application/vnd.github+json" \\',
        '    "https://api.github.com/repos/$REPO/commits/$GIT_COMMIT/statuses?per_page=100" \\',
        '    | python3 -c "import sys,json; d=json.load(sys.stdin); st=[r[\'state\'] for r in d if r[\'context\']==\'tekton/pr-code-checks-verify/code-unit-tests\']; print(st[0] if st else \'pending\')" 2>/dev/null || echo "pending")',
        '  echo "  pr-verify status: $STATE (${ELAPSED}s elapsed)"',
        '  if [ "$STATE" = "success" ] || [ "$STATE" = "failure" ]; then',
        '    echo "pr-verify completed with status: $STATE"',
        '    break',
        '  fi',
        '  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then',
        '    echo "ERROR: Timed out waiting for pr-verify"',
        '    exit 1',
        '  fi',
        '  sleep $POLL_INTERVAL',
        '  ELAPSED=$((ELAPSED + POLL_INTERVAL))',
        'done',
        '',
        'PR_NUMBER="$(get_env pr-id "")"',
        'PR_BRANCH="$(get_env pr-branch "")"',
        'TARGET_BRANCH="$(get_env target-branch "main")"',
        'PR_STATE="$(get_env pr-state "")"',
        '',
        'cd "$WORKSPACE/$(load_repo app-repo path)"',
        'npm install --loglevel warn --foreground-scripts',
        '',
        'echo "Running ESLint..."',
        'npx eslint packages/ -f json -o eslint-report.json || true',
        '',
        downloadLcovLines,
        'echo "Installing Sonar scanner..."',
        'npm install -g @sonar/scan@4.4.0',
        '',
        'if [ -n "$PR_NUMBER" ]; then',
        '  if [ "$PR_STATE" = "draft" ]; then',
        '    echo "PR is draft — skipping Sonar scan."',
        '  else',
        '    echo "Running Sonar scan for PR #${PR_NUMBER}..."',
        '    LCOV_ARGS=""',
        '    [ -n "$LCOV_PATHS" ] && LCOV_ARGS="-Dsonar.javascript.lcov.reportPaths=$LCOV_PATHS"',
        '    sonar -Dsonar.token="$SONAR_TOKEN" \\',
        '          -Dsonar.pullrequest.key="$PR_NUMBER" \\',
        '          -Dsonar.pullrequest.branch="$PR_BRANCH" \\',
        '          -Dsonar.pullrequest.base="$TARGET_BRANCH" \\',
        '          -Dsonar.newCode.referenceBranch="$TARGET_BRANCH" \\',
        '          $LCOV_ARGS',
        '  fi',
        'else',
        '  echo "No PR context found — running branch analysis..."',
        '  LCOV_ARGS=""',
        '  [ -n "$LCOV_PATHS" ] && LCOV_ARGS="-Dsonar.javascript.lcov.reportPaths=$LCOV_PATHS"',
        '  sonar -Dsonar.token="$SONAR_TOKEN" $LCOV_ARGS',
        'fi'
      ].join('\n')
    : [
        '#!/usr/bin/env bash',
        'set -eo pipefail',
        '',
        'SONAR_TOKEN="$(get_secret sonar-token)"',
        'if [ -z "$SONAR_TOKEN" ]; then',
        '  echo "ERROR: sonar-token pipeline property is not set — skipping Sonar analysis."',
        '  exit 1',
        'fi',
        '',
        'cd "$WORKSPACE/$(load_repo app-repo path)"',
        'npm install --loglevel warn --foreground-scripts',
        '',
        'echo "Running ESLint..."',
        'npx eslint packages/ -f json -o eslint-report.json || true',
        '',
        downloadLcovLines,
        'echo "Installing SonarCloud scanner..."',
        'npm install -g @sonar/scan@4.4.0',
        '',
        'echo "Running main branch Sonar analysis..."',
        'LCOV_ARGS=""',
        '[ -n "$LCOV_PATHS" ] && LCOV_ARGS="-Dsonar.javascript.lcov.reportPaths=$LCOV_PATHS"',
        'sonar -Dsonar.token="$SONAR_TOKEN" $LCOV_ARGS'
      ].join('\n');

  return {
    from: rootTask,
    displayName: 'sonar-analysis',
    runtimeClassName: 'large',
    steps: [
      { name: 'peer-review', when: 'false' },
      { name: 'detect-secrets', when: 'false' },
      { name: 'compliance-checks', when: 'false' },
      { name: 'unit-test', displayName: 'sonar-analysis', image: NODE_IMAGE, script },
      { name: 'sign-artifact', when: 'false' },
      { name: 'build-artifact', when: 'false' },
      { name: 'scan-artifact', when: 'false' }
    ]
  };
}

function buildUploadCurrencyReportTask() {
  const script = [
    '#!/usr/bin/env bash',
    'set -eo pipefail',
    '',
    'GH_ENTERPRISE_TOKEN="$(get_secret git-token)"',
    '',
    'cd "$WORKSPACE/$(load_repo app-repo path)"',
    'npm install --loglevel warn --foreground-scripts',
    '',
    'echo "Generating report..."',
    'node bin/dependencies/currency/generate-currency-report.js',
    'echo "Generated report."',
    '',
    '# Key Name: Tracer Reports 041425',
    'git clone https://oauth2:$GH_ENTERPRISE_TOKEN@github.ibm.com/instana/tracer-reports.git tracer-reports',
    'cd tracer-reports',
    '',
    'git pull origin main',
    'cp ../currency-report.md ./automated/currency/nodejs/report.md',
    '',
    'git config user.name "Instanacd PAT for GitHub Enterprise"',
    'git config user.email instana.ibm.github.enterprise@ibm.com',
    '',
    'git add .',
    '',
    'if git diff --cached --quiet; then',
    '  echo "No changes to commit. Currency report is already up to date."',
    '  exit 0',
    'fi',
    '',
    'git commit -m "chore: updated node.js currency report"',
    'git push origin main'
  ].join('\n');

  return {
    from: 'code-build',
    displayName: 'upload-currency-report',
    runtimeClassName: 'large',
    steps: [
      { name: 'unit-test', displayName: 'upload-currency-report', image: NODE_IMAGE, script },
      { name: 'sign-artifact', when: 'false' },
      { name: 'build-artifact', when: 'false' },
      { name: 'scan-artifact', when: 'false' }
    ]
  };
}

function baseConfig(fanOutTasks, rootTask = 'pr-code-checks') {
  return {
    version: '2',
    tasks: {
      [rootTask]: {
        runtimeClassName: 'large',
        steps: [
          { name: 'peer-review', when: 'false' },
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
      'code-pr-finish': { when: 'false' },
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

// Convert a pr config to a main config by swapping pr-code-checks → code-build task names.
// Strips the COS upload block from all task scripts — coverage upload is PR-only.
function toMainConfig(prConfig) {
  const UPLOAD_MARKER = '# upload executed test files to COS for coverage verification';
  const EXIT_MARKER = 'exit $LAST_EXIT';

  function stripUploadBlock(script) {
    if (typeof script !== 'string' || !script.includes(UPLOAD_MARKER)) return script;
    const lines = script.split('\n');
    const start = lines.findIndex(l => l.trimStart().startsWith(UPLOAD_MARKER));
    const end = lines.findIndex((l, i) => i > start && l.trimStart() === EXIT_MARKER);
    if (start === -1 || end === -1) return script;
    // Remove the upload block (start..end-1), keep exit $LAST_EXIT
    return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
  }

  // Deep-clone via YAML round-trip then patch task name prefix
  const raw = yaml.dump(prConfig, { lineWidth: -1 });
  const main = yaml.load(raw.replace(/\bpr-code-checks\b/g, 'code-build'));

  // Strip upload block from every step script.
  // detect-secrets and compliance-checks remain with when:'false' (same as PR)
  // so SPS explicitly skips them in test-group tasks; only the root
  // pipeline-config.yaml runs them live.
  for (const task of Object.values(main.tasks ?? {})) {
    for (const step of task.steps ?? []) {
      if (step.script) step.script = stripUploadBlock(step.script);
    }
  }

  return main;
}

const SIMPLE_TARGETS = {
  'aws-lambda': { script: 'test:ci:aws-lambda', displayName: 'aws-lambda', needs: ['localstack'] },
  'aws-fargate': { script: 'test:ci:aws-fargate', displayName: 'aws-fargate' },
  'azure-container-services': { script: 'test:ci:azure-container-services', displayName: 'azure-container-services' },
  'google-cloud-run': { script: 'test:ci:google-cloud-run', displayName: 'google-cloud-run' },
  autoprofile: {
    script: 'test:ci:autoprofile',
    displayName: 'autoprofile',
    extraEnv: 'CI_AUTOPROFILE_TEST_FILES="$TEST_FILES"'
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
            { name: 'detect-secrets' },
            { name: 'compliance-checks' },
            { name: 'unit-test', image: NODE_IMAGE, script: '#!/usr/bin/env bash\necho "General PR checks passed."' }
          ]
        },
        'code-pr-finish': { when: 'false' },
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
            { name: 'detect-secrets', when: 'false' },
            { name: 'compliance-checks', when: 'false' },
            { name: 'unit-test', image: NODE_IMAGE, script: '#!/usr/bin/env bash\necho "General PR checks passed."' },
            { name: 'sign-artifact', when: 'false' },
            { name: 'build-artifact', when: 'false' },
            { name: 'scan-artifact', when: 'false' }
          ]
        },
        'sign-artifact': { when: 'false' },
        'deploy-checks': { when: 'false' },
        'deploy-release': { when: 'false' },
        'code-ci-finish': { when: 'false' }
      }
    };
    writeDefaultConfig(prConfig, mainConfig);

    generateOne('pr-general');
  } else if (t.startsWith('collector-currencies-')) {
    const group = t.replace('collector-currencies-', '');
    const groupDir = path.join(CURRENCIES_DIR, group);
    if (!fs.existsSync(groupDir)) {
      console.error(`Unknown currency group: ${group}`);
      process.exit(1);
    }
    const folders = findTestFolders(groupDir);
    const fanOutTasks = {};
    for (const { pkgName, folder } of folders) {
      for (const { taskName, task } of buildCurrencyTasks(pkgName, folder, group)) {
        fanOutTasks[taskName] = task;
      }
    }
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (t === 'collector-metrics') {
    const { taskName, task } = buildCollectorTask(
      'collector-metrics',
      'collector-metrics',
      ['test/integration/metrics'],
      []
    );
    const prConfig = baseConfig({ [taskName]: task });
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (t === 'collector-misc-and-unit') {
    // Groups are defined in packages/collector/test/integration/misc/.split
    // (JSON object: { "group-name": ["subdir", ...], ... }).
    // Folders with a .needs file are auto-detected → misc-dind task (no .split entry needed).
    const miscDir = path.join(REPO_ROOT, 'packages/collector/test/integration/misc');

    // Auto-detect dind folders by presence of .needs
    const dindFolders = fs.existsSync(miscDir)
      ? fs
          .readdirSync(miscDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && fs.existsSync(path.join(miscDir, e.name, '.needs')))
          .map(e => e.name)
      : [];
    const dindSet = new Set(dindFolders);

    // Load group definitions
    const miscSplitPath = path.join(miscDir, '.split');
    if (!fs.existsSync(miscSplitPath)) {
      console.error(`collector-misc: missing ${miscSplitPath}. Create it to define groups.`);
      process.exit(1);
    }

    // All non-dind dirs, sorted alphabetically (includes long_* — treated as regular misc tests).
    const allDirs = fs.existsSync(miscDir)
      ? fs
          .readdirSync(miscDir, { withFileTypes: true })
          .filter(e => e.isDirectory())
          .map(e => e.name)
          .sort()
      : [];
    const nonDindDirs = allDirs.filter(d => !dindSet.has(d));

    const splitRaw = fs.readFileSync(miscSplitPath, 'utf-8').trim();
    const splitN = Number(splitRaw);

    let splitDef;
    if (!isNaN(splitN) && splitN > 0) {
      const count = Math.min(Math.round(splitN), nonDindDirs.length);
      const size = Math.ceil(nonDindDirs.length / count);
      splitDef = {};
      for (let i = 0; i < nonDindDirs.length; i += size) {
        const groupIndex = Math.floor(i / size) + 1;
        splitDef[`misc-${groupIndex}`] = nonDindDirs.slice(i, i + size);
      }
    } else {
      let parsed;
      try {
        parsed = JSON.parse(splitRaw);
      } catch {
        console.error(
          `${miscSplitPath}: unrecognised content "${splitRaw}". Use a positive number (e.g. "3") or a JSON object.`
        );
        process.exit(1);
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.error(`${miscSplitPath}: JSON value must be an object mapping group names to subdirectory arrays.`);
        process.exit(1);
      }
      splitDef = parsed;
      const allListed = new Set(Object.values(splitDef).flat());
      const unlisted = nonDindDirs.filter(d => !allListed.has(d));
      if (unlisted.length > 0) {
        console.error(
          `collector-misc: unlisted folders (not in .split, no .needs):\n` +
            unlisted.map(d => `  - ${d}`).join('\n') +
            `\nAdd them to a group in misc/.split and re-run the generator.`
        );
        process.exit(1);
      }
    }

    const fanOutTasks = {};

    // Non-dind groups — each entry in splitDef becomes one buildCollectorTask call
    for (const [groupName, subdirs] of Object.entries(splitDef)) {
      const paths = subdirs.filter(name => !dindSet.has(name)).map(name => `test/integration/misc/${name}`);
      const { taskName, task } = buildCollectorTask(groupName, `collector-${groupName}`, paths, []);
      fanOutTasks[taskName] = task;
    }

    // unit — collector unit tests (test/unit), no external deps needed
    {
      const { taskName, task } = buildCollectorTask('collector-unit', 'collector-unit', ['test/unit'], []);
      fanOutTasks[taskName] = task;
    }

    // misc-dind — auto-detected .needs folders, union of all their sidecar requirements
    if (dindFolders.length > 0) {
      const dindNeeds = [...new Set(dindFolders.flatMap(name => readNeeds(path.join(miscDir, name))))];
      const dindPaths = dindFolders.map(name => `test/integration/misc/${name}`);
      const { taskName, task } = buildCollectorTask('misc-dind', 'collector-misc-dind', dindPaths, dindNeeds);
      fanOutTasks[taskName] = task;
    }
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (GROUP_TARGETS[t]) {
    const members = GROUP_TARGETS[t];
    const fanOutTasks = {};
    for (const member of members) {
      const { script, displayName, needs = [], extraEnv } = SIMPLE_TARGETS[member];
      fanOutTasks[`pr-code-checks-${member}`] = buildSimpleTask(member, displayName, script, needs, extraEnv);
    }
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else if (t === 'pr-general') {
    const prConfig = baseConfig(buildGeneralTasks());
    writeConfig('general', prConfig, toMainConfig(prConfig));
  } else if (t === 'pr-verify') {
    // Count expected GitHub check-runs from all other PR pipeline configs.
    // Each task name becomes exactly one check-run on GitHub.
    // A task produces NO check-run when:
    //   - it has when:false at task level (e.g. deploy-checks, deploy-release), OR
    //   - it has no active unit-test step (pure infra tasks: code-pr-finish, code-ci-finish), OR
    //   - its unit-test step has displayName 'npm-install' (the shared setup task pr-code-checks)
    const spsDir = path.join(__dirname, '..');
    const prDir = path.join(spsDir, 'pr');
    const seenTasks = new Set();
    for (const file of fs.readdirSync(prDir)) {
      if (!file.startsWith('pipeline-config-') || !file.endsWith('.yaml')) continue;
      if (file === 'pipeline-config-pr-verify.yaml') continue;
      const cfg = yaml.load(fs.readFileSync(path.join(prDir, file), 'utf8'));
      for (const [name, taskDef] of Object.entries(cfg.tasks || {})) {
        if (typeof taskDef !== 'object' || taskDef === null) continue;
        if (taskDef.when === false) continue;
        const steps = taskDef.steps ?? [];
        const unitTestStep = steps.find(s => s.name === 'unit-test' && s.when !== 'false');
        if (!unitTestStep) continue;
        if ((unitTestStep.displayName ?? '') === 'npm-install') continue;
        seenTasks.add(name);
      }
    }
    const expectedChecks = seenTasks.size;

    const script = [
      '#!/usr/bin/env bash',
      'set -eo pipefail',
      '',
      'GH_TOKEN="$(get_secret gh-public-token)"',
      'COS_API_KEY="$(get_secret ibm-object-storage-api-key)"',
      'GIT_COMMIT="$(get_env HEAD_SHA "")"',
      'REPO="instana/nodejs"',
      '',
      'if [ -z "$GH_TOKEN" ] || [ -z "$COS_API_KEY" ] || [ -z "$GIT_COMMIT" ]; then',
      '  echo "ERROR: Missing required credentials or git commit — aborting"',
      '  exit 1',
      'fi',
      '',
      '# ── Fetch IAM token up-front (needed for progressive COS downloads) ─────',
      'echo "Fetching IAM token..."',
      'IAM_TOKEN=$(curl -s -X POST "https://iam.cloud.ibm.com/identity/token" \\',
      '  -H "Content-Type: application/x-www-form-urlencoded" \\',
      '  -d "grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=$COS_API_KEY" \\',
      "  | python3 -c \"import sys,json; print(json.load(sys.stdin).get('access_token',''))\")",
      'if [ -z "$IAM_TOKEN" ]; then',
      '  echo "ERROR: Failed to obtain IAM token — check ibm-object-storage-api-key secret"',
      '  exit 1',
      'fi',
      'echo "IAM token obtained."',
      '',
      'TMPDIR=$(mktemp -d)',
      'CLAIMED_FILE="$TMPDIR/all-claimed.txt"',
      'DOWNLOADED_FILE="$TMPDIR/downloaded.txt"   # tracks task slugs already fetched from COS',
      'touch "$CLAIMED_FILE" "$DOWNLOADED_FILE"',
      '',
      'cd "$WORKSPACE/$(load_repo app-repo path)"',
      'npm install --loglevel warn --foreground-scripts',
      'node bin/create-version-test-folders.js',
      '',
      '# Helper: download the COS result file for a single completed status context.',
      '# Context format: "tekton/pr-code-checks-<slug>/code-unit-tests"',
      '# Skips silently if already downloaded or if COS has no file for it.',
      'download_cos_result() {',
      '  local context="$1"',
      '  # Only handle collector task contexts (must have a slug after "pr-code-checks-")',
      '  [[ "$context" != tekton/pr-code-checks-*/* ]] && return 0',
      '  # Derive slug: strip "tekton/pr-code-checks-" prefix and "/code-unit-tests" suffix',
      '  local slug="${context#tekton/pr-code-checks-}"',
      '  slug="${slug%/code-unit-tests}"',
      '  grep -qxF "$slug" "$DOWNLOADED_FILE" && return 0',
      '  local key="test-results/$GIT_COMMIT/${slug}.txt"',
      '  local RESPONSE HTTP_CODE BODY',
      `  RESPONSE=$(curl -s -w "\\n%{http_code}" \\`,
      `    "https://s3.eu-de.cloud-object-storage.appdomain.cloud/${COS_BUCKET}/$key" \\`,
      '    -H "Authorization: Bearer $IAM_TOKEN")',
      '  HTTP_CODE=$(echo "$RESPONSE" | tail -1)',
      '  BODY=$(echo "$RESPONSE" | sed \'$d\')',
      '  if [ "$HTTP_CODE" = "200" ]; then',
      '    echo "  ✔ $slug"',
      '    echo "$BODY" >> "$CLAIMED_FILE"',
      '    echo "" >> "$CLAIMED_FILE"',
      '  elif [ "$HTTP_CODE" = "404" ]; then',
      '    echo "  – $slug (no COS file found yet)"',
      '  else',
      '    echo "  ✘ $slug HTTP $HTTP_CODE"',
      '  fi',
      '  echo "$slug" >> "$DOWNLOADED_FILE"',
      '}',
      '',
      '# Helper: fetch all commit statuses (handles pagination)',
      'fetch_statuses() {',
      '  local page=1',
      '  local accfile pagefile',
      '  accfile=$(mktemp)',
      '  pagefile=$(mktemp)',
      '  echo "[]" > "$accfile"',
      '  while true; do',
      '    curl -sf \\',
      '      -H "Authorization: Bearer $GH_TOKEN" \\',
      '      -H "Accept: application/vnd.github+json" \\',
      '      "https://api.github.com/repos/$REPO/commits/$GIT_COMMIT/statuses?per_page=100&page=$page" > "$pagefile"',
      '    local count',
      '    count=$(python3 -c "import sys,json; print(len(json.load(open(sys.argv[1]))))" "$pagefile" 2>/dev/null || echo 0)',
      '    # Append this page to accumulated results',
      '    python3 - "$accfile" "$pagefile" <<\'PYEOF\'',
      'import sys, json',
      'acc = json.load(open(sys.argv[1]))',
      'page = json.load(open(sys.argv[2]))',
      'acc.extend(page)',
      'json.dump(acc, open(sys.argv[1], "w"))',
      'PYEOF',
      '    [ "$count" -lt 100 ] && break',
      '    page=$((page + 1))',
      '  done',
      '  cat "$accfile"',
      '  rm -f "$accfile" "$pagefile"',
      '}',
      '',
      '# ── Phase 1: wait until all EXPECTED_CHECKS are registered ──────────────',
      `echo "Waiting for all ${expectedChecks} expected checks to be registered on commit $GIT_COMMIT..."`,
      'MAX_WAIT=3600',
      'POLL_INTERVAL=30',
      'ELAPSED=0',
      `EXPECTED_CHECKS=${expectedChecks}`,
      'while true; do',
      '  STATUSES=$(fetch_statuses)',
      '  # Count unique contexts (deduplicate — statuses API returns history, latest first)',
      '  OTHERS=$(echo "$STATUSES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(set(r[\'context\'] for r in d if r[\'context\'].startswith(\'tekton/pr-code-checks-\') and not r[\'context\'].startswith(\'tekton/pr-code-checks-verify\') and not r[\'context\'].startswith(\'tekton/pr-code-checks-sonar\'))))")',
      '  echo "  $OTHERS / $EXPECTED_CHECKS checks registered (${ELAPSED}s elapsed)"',
      '  if [ "$OTHERS" -ge "$EXPECTED_CHECKS" ]; then',
      '    echo "All expected checks are now registered."',
      '    break',
      '  fi',
      '  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then',
      '    echo "ERROR: Timed out after ${MAX_WAIT}s waiting for checks to be registered"',
      '    exit 1',
      '  fi',
      '  sleep $POLL_INTERVAL',
      '  ELAPSED=$((ELAPSED + POLL_INTERVAL))',
      'done',
      '',
      '# ── Phase 2: poll until all checks complete, download COS files eagerly ──',
      'echo "Polling for completions — downloading COS results as each check finishes..."',
      'echo ""',
      'echo "=== Tests that ran ==="',
      'while true; do',
      '  STATUSES=$(fetch_statuses)',
      '  # Download COS file for every completed (success/failure) code-unit-tests status',
      '  while IFS= read -r context; do',
      '    download_cos_result "$context"',
      "  done < <(echo \"$STATUSES\" | python3 -c \"import sys,json; d=json.load(sys.stdin); seen=set(); [print(r['context']) or seen.add(r['context']) for r in d if r['context'].endswith('/code-unit-tests') and r['context'] not in seen and r['state'] in ('success','failure') and not r['context'].startswith('tekton/pr-code-checks-verify') and not r['context'].startswith('tekton/sonar-analysis')]\")",
      '  PENDING=$(echo "$STATUSES" | python3 -c "import sys,json; d=json.load(sys.stdin); seen=set(); pending=0',
      'for r in d:',
      '    c=r[\'context\']',
      '    if not c.endswith(\'/code-unit-tests\') or c.startswith(\'tekton/pr-code-checks-verify\') or c.startswith(\'tekton/sonar-analysis\'): continue',
      '    if c in seen: continue',
      '    seen.add(c)',
      "    if r['state']=='pending': pending+=1",
      'print(pending)")',
      '  echo "  $PENDING checks still pending (${ELAPSED}s elapsed)"',
      '  if [ "$PENDING" -eq 0 ]; then',
      '    echo "All checks completed."',
      '    break',
      '  fi',
      '  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then',
      '    echo "ERROR: Timed out after ${MAX_WAIT}s waiting for checks to complete"',
      '    exit 1',
      '  fi',
      '  sleep $POLL_INTERVAL',
      '  ELAPSED=$((ELAPSED + POLL_INTERVAL))',
      'done',
      '',
      '# ── Phase 3: compare against all test files in repo ──────────────────────',
      'REPO_PATH="$WORKSPACE/$(load_repo app-repo path)"',
      'ALL_TESTS=$(find "$REPO_PATH/packages" \\',
      '  -name "*.test.js" \\',
      '  -not -path "*/node_modules/*" \\',
      '  | sed "s|$REPO_PATH/packages/[^/]*/||" | sort)',
      '',
      'UNCOVERED_LIST=""',
      'MISSING=0',
      'while IFS= read -r test_file; do',
      '  [ -z "$test_file" ] && continue',
      '  if ! grep -qF "$test_file" "$CLAIMED_FILE"; then',
      '    UNCOVERED_LIST="$UNCOVERED_LIST\\n  $test_file"',
      '    MISSING=$((MISSING + 1))',
      '  fi',
      'done <<< "$ALL_TESTS"',
      '',
      'TOTAL=$(echo "$ALL_TESTS" | wc -l | tr -d " ")',
      'CLAIMED_COUNT=$(sort -u "$CLAIMED_FILE" | grep -c "\\.test\\.js" || true)',
      '',
      'echo ""',
      'echo "=== Coverage Report ==="',
      'echo "Total test files in repo: $TOTAL"',
      'echo "Covered by tasks:         $CLAIMED_COUNT"',
      'echo "Not covered:              $MISSING"',
      '',
      'if [ "$MISSING" -gt 0 ]; then',
      '  echo ""',
      '  echo "=== Uncovered test files ==="',
      '  printf "%b\\n" "$UNCOVERED_LIST"',
      '  echo ""',
      '  echo "❌ $MISSING test file(s) not covered by any pipeline task"',
      '  exit 1',
      'else',
      '  echo "✅ All $TOTAL test files are covered"',
      'fi'
    ].join('\n');

    const prConfig = {
      version: '2',
      tasks: {
        'pr-code-checks': {
          steps: [
            { name: 'peer-review', when: 'false' },
            { name: 'unit-test', image: NODE_IMAGE, script: '#!/usr/bin/env bash\necho "pr-verify starting..."' }
          ]
        },
        'code-pr-finish': { when: 'false' },
        'code-ci-finish': { steps: [{ name: 'run-stage', when: 'false' }] },
        'deploy-checks': { when: false },
        'deploy-release': { when: false },
        'pr-code-checks-verify': {
          from: 'pr-code-checks',
          displayName: 'pr-verify',
          runtimeClassName: 'large',
          steps: [
            { name: 'peer-review', when: 'false' },
            { name: 'detect-secrets', when: 'false' },
            { name: 'compliance-checks', when: 'false' },
            { name: 'unit-test', displayName: 'pr-verify', image: NODE_IMAGE, script },
            { name: 'sign-artifact', when: 'false' },
            { name: 'build-artifact', when: 'false' },
            { name: 'scan-artifact', when: 'false' }
          ]
        },
        'sonar-analysis': buildSonarTask('pr-code-checks')
      }
    };
    const output = yaml.dump(prConfig, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    const prPath = path.join(spsDir, 'pr', 'pipeline-config-pr-verify.yaml');
    fs.writeFileSync(prPath, output);
    console.log(`Written: ${prPath}`);
  } else if (t === 'upload-currency-report') {
    const mainConfig = {
      version: '2',
      tasks: {
        'code-build': {
          runtimeClassName: 'large',
          steps: [
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
        'code-pr-finish': { when: 'false' },
        'code-ci-finish': { steps: [{ name: 'run-stage', when: 'false' }] },
        'deploy-checks': { when: false },
        'deploy-release': { when: false },
        'code-build-upload-currency-report': buildUploadCurrencyReportTask()
      }
    };
    const spsDir = path.join(__dirname, '..');
    const output = yaml.dump(mainConfig, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    if (MODE === 'all' || MODE === 'main') {
      const mainPath = path.join(spsDir, 'main', 'pipeline-config-upload-currency-report.yaml');
      fs.writeFileSync(mainPath, output);
      console.log(`Written: ${mainPath}`);
    }
  } else if (SIMPLE_TARGETS[t]) {
    const { script, displayName, needs = [], extraEnv } = SIMPLE_TARGETS[t];
    const fanOutTasks = { [`pr-code-checks-${t}`]: buildSimpleTask(t, displayName, script, needs, extraEnv) };
    const prConfig = baseConfig(fanOutTasks);
    writeConfig(t, prConfig, toMainConfig(prConfig));
  } else {
    console.error(`Unknown target: ${t}`);
    process.exit(1);
  }
}

const targets = TARGET ? [TARGET] : ALL_TARGETS;
for (const t of targets) generateOne(t);
