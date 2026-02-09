/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_PREFIX = 'INSTANA_CONNECT_';

const sidecarGroups = {
  redis: ['redis', 'redis-slave', 'redis-sentinel'],
  kafka: ['zookeeper', 'kafka', 'kafka-topics', 'schema-registry'],
  nats: ['nats', 'nats-streaming', 'nats-streaming-2']
};

/**
 * Scan collector test files to count how many tests need each sidecar.
 * Uses the same INSTANA_CONNECT_* detection as claim-tests.sh.
 */
function countTestsPerSidecar(packageName) {
  const hostsConfig = require(path.join(__dirname, '..', 'hosts_config.json'));
  const knownEnvVars = new Set(Object.keys(hostsConfig));

  const sidecarsJson = require(path.join(__dirname, 'assets', 'sidecars.json'));
  const validSidecars = new Set(Object.keys(sidecarGroups));
  for (const sc of sidecarsJson.sidecars) {
    if (!Object.values(sidecarGroups).some(g => g.includes(sc.name))) {
      validSidecars.add(sc.name);
    }
  }

  const packageDir = path.join(__dirname, '..', 'packages', packageName);
  let allTests;
  try {
    const raw = execSync(
      'find . -path "*/test/**" -name "*.test.js"' +
      ' -not -path "*/node_modules/*" -not -path "*/long_*/*"',
      { cwd: packageDir, encoding: 'utf8' }
    );
    allTests = raw.trim().split('\n').filter(Boolean);
  } catch (e) {
    console.warn('Warning: could not scan test files, using empty counts');
    return {};
  }

  // Same filter as claim-tests.sh: _v* dirs only accept *.test.js (flat or mode subdir)
  const filtered = allTests.filter(f => {
    if (!/_v[0-9]/.test(f)) return true;
    return /\/_v[^/]+\/([^/]+\/)?[^/]+\.test\.js$/.test(f);
  });

  const counts = {};
  const contentWeightCache = new Map();

  // Content weight per scanDir: test_base.js size with superlinear scaling (KB^1.5)
  // Longer tests are disproportionally heavier (more setup/teardown cycles, retries, I/O waits)
  function getContentWeight(scanDir) {
    if (contentWeightCache.has(scanDir)) return contentWeightCache.get(scanDir);
    let totalBytes = 0;
    try {
      const testBase = path.join(scanDir, 'test_base.js');
      if (fs.existsSync(testBase)) {
        totalBytes = fs.statSync(testBase).size;
      }
    } catch (_) {}
    const kb = totalBytes / 1024;
    const weight = Math.max(1, Math.round(Math.pow(kb, 1.5)));
    contentWeightCache.set(scanDir, weight);
    return weight;
  }

  let totalWeight = 0;

  for (const testFile of filtered) {
    const testDir = path.dirname(path.join(packageDir, testFile));
    // Navigate up to the test package dir (past _v* and optional mode subdir)
    let scanDir = testDir;
    if (/_v[^/\\]*$/.test(scanDir)) {
      scanDir = path.dirname(scanDir);
    } else if (/_v[^/\\]*$/.test(path.dirname(scanDir))) {
      scanDir = path.dirname(path.dirname(scanDir));
    }

    const weight = getContentWeight(scanDir);
    totalWeight += weight;

    let grepResult = '';
    try {
      grepResult = execSync(
        'find -L . -maxdepth 1 \\( -name "*.js" -o -name "*.mjs" \\)' +
        ` -exec grep -h -o "${ENV_PREFIX}[A-Z0-9_]*" {} + 2>/dev/null`,
        { cwd: scanDir, encoding: 'utf8' }
      );
    } catch (e) {
      // no matches
    }

    const envVars = [...new Set(grepResult.trim().split('\n').filter(Boolean))];
    const sidecars = new Set();

    for (const envVar of envVars) {
      if (knownEnvVars.has(envVar)) {
        const sidecar = envVar.replace(ENV_PREFIX, '').split('_')[0].toLowerCase();
        if (validSidecars.has(sidecar)) {
          sidecars.add(sidecar);
        }
      }
    }

    for (const s of sidecars) {
      counts[s] = (counts[s] || 0) + weight;
    }
  }

  const sidecarTestCount = Object.values(counts).reduce((a, b) => a + b, 0);

  console.log('\nAuto-detected sidecar weights (content-weighted, KB):');
  for (const [name, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }
  console.log(`  (generic tests without sidecars: ${totalWeight - sidecarTestCount})`);
  console.log(`  (total weight: ${totalWeight}, files: ${filtered.length})`);

  return { counts, totalTests: totalWeight };
}

const collectorSidecarData = countTestsPerSidecar('collector');

const packages = {
  'test:ci:collector': {
    splits: 35,
    sidecars: collectorSidecarData.counts,
    totalTests: collectorSidecarData.totalTests
  },

  'test:ci:autoprofile': {},
  'test:ci:aws-fargate': {},
  'test:ci:aws-lambda': { split: 5 },
  'test:ci:azure-container-services': {},
  'test:ci:core': {},
  'test:ci:google-cloud-run': {},
  'test:ci:metrics-util': {},
  'test:ci:opentelemetry-exporter': {},
  'test:ci:opentelemetry-sampler': {},
  'test:ci:serverless': {},
  'test:ci:shared-metrics': {},
  'test:ci:serverless-collector': {}
};

function getPackageName(groupName) {
  return groupName.replace('test:ci:', '');
}

function generateScope(groupName) {
  const packageName = getPackageName(groupName);
  return `@instana/${packageName}`;
}

function generateSubname(groupName, config) {
  if (config.sidecars && typeof config.sidecars === 'object' && !Array.isArray(config.sidecars)) {
    return 'test:ci';
  }
  if (config.split) {
    return 'test:ci';
  }
  return 'false';
}

function generateCondition(groupName) {
  if (groupName === 'test:ci:collector') {
    return ' && true';
  }
  const packageName = getPackageName(groupName);
  return ` && ! echo "$MODIFIED_FILES" | grep -q "packages/${packageName}"`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Expand a sidecar name to its full group (if it's a group), or return as single-item array
 */
function expandSidecar(name) {
  return sidecarGroups[name] || [name];
}

/**
 * Calculate total weight for a list of sidecars
 */
function calculateWeight(sidecars) {
  return sidecars.reduce((sum, s) => sum + (sidecarWeights[s] || 1), 0);
}

/**
 * Distribute sidecars across N tasks based on how many tasks each sidecar actually needs.
 * quota = totalTests / numTasks (how many tests each task handles)
 * replicas per sidecar = ceil(testCount / quota) (minimum tasks needed to cover all tests)
 * Remaining tasks go to the heaviest sidecars.
 */
function distributeSidecars(sidecarConfig, numTasks, totalTests) {
  const quota = totalTests / numTasks;
  const sidecarData = [];

  for (const [name, weight] of Object.entries(sidecarConfig)) {
    const sidecars = expandSidecar(name);
    const minReplicas = Math.max(1, Math.ceil(weight / quota));
    sidecarData.push({ name, sidecars, weight, replicas: minReplicas });
  }

  console.log(`\n  Quota per task: ${quota.toFixed(1)} (${totalTests} total weight / ${numTasks} tasks)`);
  for (const d of sidecarData.sort((a, b) => b.weight - a.weight)) {
    console.log(`  ${d.name}: weight ${d.weight} → ${d.replicas} tasks needed`);
  }

  // Track allocated replicas per sidecar
  const allocated = new Map(sidecarData.map(d => [d.name, d.replicas]));

  // Fill remaining tasks: give each extra to the sidecar with the worst tests-per-task ratio
  const totalAllocated = () => [...allocated.values()].reduce((a, b) => a + b, 0);
  while (totalAllocated() < numTasks) {
    let worst = null;
    let worstRatio = 0;
    for (const d of sidecarData) {
      const ratio = d.weight / allocated.get(d.name);
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worst = d;
      }
    }
    allocated.set(worst.name, allocated.get(worst.name) + 1);
  }

  const items = [];
  for (const data of sidecarData) {
    const replicas = allocated.get(data.name);
    for (let i = 0; i < replicas; i++) {
      items.push({ name: data.name, sidecars: data.sidecars, weight: data.weight });
    }
  }

  items.sort((a, b) => b.weight - a.weight);

  const tasks = Array.from({ length: numTasks }, (_, i) => ({
    index: i + 1,
    sidecars: [],
    sidecarSet: new Set(),
    sidecarNames: new Set(),
    weight: 0
  }));

  for (const item of items) {
    const minTask = tasks.reduce((min, t) => (t.weight < min.weight ? t : min), tasks[0]);

    minTask.sidecarNames.add(item.name);

    for (const sc of item.sidecars) {
      if (!minTask.sidecarSet.has(sc)) {
        minTask.sidecars.push(sc);
        minTask.sidecarSet.add(sc);
      }
    }

    minTask.weight += item.weight;
  }

  return tasks.map(t => ({
    index: t.index,
    sidecars: t.sidecars,
    sidecarNames: [...t.sidecarNames],
    weight: t.weight
  }));
}

// =============================================================================
// TEMPLATE RENDERING
// =============================================================================

const sidecarsData = require('./assets/sidecars.json');

function renderSidecar(sidecarName) {
  const sidecarTemplate = fs.readFileSync(path.join(__dirname, 'templates/sidecar.yaml.template'), 'utf-8');
  const sidecar = sidecarsData.sidecars.find(s => s.name === sidecarName);

  if (!sidecar) {
    console.warn(`Warning: Sidecar "${sidecarName}" not found in sidecars.json`);
    return '';
  }

  let templ = sidecarTemplate.replace('{{name}}', sidecar.name).replace('{{image}}', sidecar.image);

  if (sidecar.env) {
    let res = 'env:\n';
    res += sidecar.env.map(e => `          - name: "${e.name}"\n            value: "${e.value}"\n`).join('');
    templ = templ.replace('{{env}}', res);
  } else {
    templ = templ.replace('{{env}}', '');
  }

  if (sidecar.command) {
    let res = 'command:\n';
    sidecar.command.forEach(cmd => {
      if (typeof cmd === 'string' && (cmd.includes('\n') || cmd.includes('&&'))) {
        res += `          - |\n`;
        const lines = cmd.split('\n').length > 1 ? cmd.split('\n') : cmd.split('&&').map(c => c.trim());
        lines.forEach(line => {
          res += `            ${line}\n`;
        });
      } else {
        res += `          - ${JSON.stringify(cmd)}\n`;
      }
    });
    templ = templ.replace('{{command}}', res);
  } else {
    templ = templ.replace('{{command}}', '');
  }

  if (sidecar.args) {
    let res = 'args:\n';
    sidecar.args.forEach(arg => {
      if (typeof arg === 'string' && (arg.includes('\n') || arg.includes('&&'))) {
        res += `          - |\n`;
        const lines = arg.split('\n').length > 1 ? arg.split('\n') : arg.split('&&').map(cmd => cmd.trim());
        lines.forEach(line => {
          res += `            ${line}\n`;
        });
      } else {
        res += `          - ${JSON.stringify(arg)}\n`;
      }
    });
    templ = templ.replace('{{args}}', res);
  } else {
    templ = templ.replace('{{args}}', '');
  }

  if (sidecar.readinessProbe) {
    let res = 'readinessProbe:\n';

    if (sidecar.readinessProbe.exec) {
      res += '          exec:\n';
      res += '            command:\n';
      res += sidecar.readinessProbe.exec.command.map(cmd => `            - "${cmd}"\n`).join('');
    }

    if (sidecar.readinessProbe.httpGet) {
      res += '          httpGet:\n';
      res += `            path: ${sidecar.readinessProbe.httpGet.path} \n`;
      res += `            port: ${sidecar.readinessProbe.httpGet.port} \n`;
    }

    if (sidecar.readinessProbe.tcpSocket) {
      res += '          tcpSocket:\n';
      res += `            port: ${sidecar.readinessProbe.tcpSocket.port} \n`;
    }

    if (sidecar.readinessProbe.initialDelaySeconds) {
      res += `          initialDelaySeconds: ${sidecar.readinessProbe.initialDelaySeconds}\n`;
    }

    if (sidecar.readinessProbe.periodSeconds) {
      res += `          periodSeconds: ${sidecar.readinessProbe.periodSeconds}\n`;
    }

    if (sidecar.readinessProbe.timeoutSeconds) {
      res += `          timeoutSeconds: ${sidecar.readinessProbe.timeoutSeconds}\n`;
    }

    templ = templ.replace('{{readinessProbe}}', res);
  } else {
    templ = templ.replace('{{readinessProbe}}', '');
  }

  templ = templ.replace('{{readinessProbe}}', '');

  return templ
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');
}

function generateTask(taskName, sidecars, options = {}) {
  const templateContent = fs.readFileSync(path.join(__dirname, 'templates/test-task.yaml.template'), 'utf-8');

  const sidecarYaml = sidecars.map(s => renderSidecar(s)).filter(Boolean).join('\n');
  const availableSidecars = sidecars.join(',');
  const claimTests = options.scope === '@instana/collector' ? 'true' : 'false';
  const totalTasks = options.split || '1';

  let filledTemplate = templateContent;
  filledTemplate = filledTemplate.replace('{{condition}}', options.condition || '');
  filledTemplate = filledTemplate
    .replace(/{{sanitizedGroupName}}/g, taskName)
    .replace(/{{sidecars}}/g, `sidecars:\n${sidecarYaml}`)
    .replace(/{{availableSidecars}}/g, availableSidecars)
    .replace(/{{claimTests}}/g, claimTests)
    .replace(/{{totalTasks}}/g, totalTasks)
    .replace(/{{groupName}}/g, options.groupName || `test:ci:${taskName}`)
    .replace(/{{subname}}/g, options.subname || 'false')
    .replace(/{{split}}/g, options.split || 'false')
    .replace(/{{splitNumber}}/g, options.splitNumber || '1')
    .replace(/{{scope}}/g, options.scope || 'false')
    .replace(/{{sidecarCounts}}/g, options.sidecarCounts || '');

  filledTemplate = filledTemplate
    .split('\n')
    .filter(line => line.trim() !== '')
    .join('\n');

  return filledTemplate;
}

function writeTask(fileName, content) {
  const location = path.join(__dirname, 'tasks', 'test-groups', fileName);

  if (fs.existsSync(location)) {
    fs.unlinkSync(location);
  }

  fs.writeFileSync(location, content);
  console.log(`Generated ${fileName}`);
}

function cleanupOldCollectorTasks() {
  const taskDir = path.join(__dirname, 'tasks', 'test-groups');
  const oldFiles = fs.readdirSync(taskDir).filter(f => f.startsWith('collector-'));
  for (const f of oldFiles) {
    fs.unlinkSync(path.join(taskDir, f));
  }
  if (oldFiles.length > 0) {
    console.log(`Cleaned up ${oldFiles.length} old collector task files`);
  }
}

function updatePipelineCollectorEntries(tasks) {
  const pipelinePath = path.join(__dirname, 'pipeline', 'default-pipeline.yaml');
  const lines = fs.readFileSync(pipelinePath, 'utf-8').split('\n');

  let firstCollectorLine = -1;
  let afterLastCollectorLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s{4}- name: collector-/.test(lines[i])) {
      if (firstCollectorLine === -1) firstCollectorLine = i;
      let j = i + 1;
      while (j < lines.length && !/^\s{4}- name: /.test(lines[j]) && !/^\s{2}finally:/.test(lines[j])) {
        j++;
      }
      afterLastCollectorLine = j;
      i = j - 1;
    }
  }

  if (firstCollectorLine === -1) {
    console.warn('Warning: could not find collector entries in pipeline YAML');
    return;
  }

  const newEntries = [];
  for (const { taskName, displayName } of tasks) {
    newEntries.push(
      `    - name: ${displayName}-task`,
      '      runAfter:',
      '        - execute-tools',
      '      taskRef:',
      `        name: ${taskName}`,
      '      params:',
      '        - name: node-version',
      '          value: $(params.node-version)',
      '        - name: npm-version',
      '          value: $(params.npm-version)          ',
      '        - name: repository',
      '          value: $(params.repository)',
      '        - name: revision',
      '          value: $(params.commit-id)',
      '        - name: continuous-delivery-context-secret',
      '          value: "secure-properties"',
      '        - name: esm',
      '          value: $(params.esm)',
      '        - name: coverage',
      '          value: $(params.coverage)',
      '        - name: prerelease',
      '          value: $(params.prerelease)   ',
      '      workspaces:',
      '        - name: output',
      '          workspace: artifacts'
    );
  }

  const result = [
    ...lines.slice(0, firstCollectorLine),
    ...newEntries,
    ...lines.slice(afterLastCollectorLine)
  ];

  fs.writeFileSync(pipelinePath, result.join('\n'));
  console.log(`Updated pipeline with ${tasks.length} collector task entries`);
}

// =============================================================================
// MAIN: Generate all tasks
// =============================================================================

console.log('\n=== Generating Tasks ===\n');

for (const [groupName, config] of Object.entries(packages)) {
  if (config.sidecars && typeof config.sidecars === 'object' && !Array.isArray(config.sidecars)) {
    console.log(`\nDistributing ${Object.keys(config.sidecars).length} sidecar groups across ${config.splits} collector tasks:\n`);

    cleanupOldCollectorTasks();

    const collectorTasks = distributeSidecars(config.sidecars, config.splits, config.totalTests);

    const sidecarCounts = {};
    collectorTasks.forEach(t => {
      t.sidecars.forEach(s => {
        sidecarCounts[s] = (sidecarCounts[s] || 0) + 1;
      });
    });
    const sidecarCountsStr = Object.entries(sidecarCounts).map(([k, v]) => `${k}=${v}`).join(',');

    const collectorTasks_ = [];

    for (const task of collectorTasks) {
      const sidecarSuffix = task.sidecarNames.join('-');
      const taskName = `collector-${task.index}-${sidecarSuffix}`;

      collectorTasks_.push({ taskName, displayName: taskName });
      console.log(`  ${taskName}: [${task.sidecars.join(', ')}] (weight: ${task.weight})`);

      const content = generateTask(taskName, task.sidecars, {
        groupName,
        subname: generateSubname(groupName, config),
        split: config.splits,
        splitNumber: task.index,
        scope: generateScope(groupName),
        condition: generateCondition(groupName),
        sidecarCounts: sidecarCountsStr
      });

      writeTask(`${taskName}-task.yaml`, content);
    }

    updatePipelineCollectorEntries(collectorTasks_);
  } else {
    const runs = config.split ? Array.from({ length: config.split }, (_, i) => i + 1) : [1];

    for (const number of runs) {
      let sanitizedGroupName = groupName.replace(/:/g, '-').replace(/^test-/, '').replace(/^ci-/, '');

      if (number > 1) {
        sanitizedGroupName = `${sanitizedGroupName}-split-${number}`;
      }

      const content = generateTask(sanitizedGroupName, config.sidecars || [], {
        groupName,
        subname: generateSubname(groupName, config),
        split: config.split || 'false',
        splitNumber: number,
        scope: generateScope(groupName),
        condition: generateCondition(groupName)
      });

      writeTask(`${sanitizedGroupName}-task.yaml`, content);
    }
  }
}

console.log('\nDone!');

