/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
const path = require('path');

const sidecarGroups = {
  redis: ['redis', 'redis-slave', 'redis-sentinel'],
  kafka: ['zookeeper', 'kafka', 'kafka-topics', 'schema-registry'],
  nats: ['nats', 'nats-streaming', 'nats-streaming-2']
};

const packages = {
  'test:ci:collector': {
    splits: 40,
    sidecars: {
      postgres: 4,
      mysql: 4,
      mongodb: 4,
      memcached: 2,
      elasticsearch: 8,
      couchbase: 7,
      oracledb: 7,
      redis: 6,
      kafka: 18,
      nats: 6,
      rabbitmq: 3,
      localstack: 4
    }
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
    return groupName;
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
 * Distribute sidecars across N tasks, balanced by weight
 * Uses greedy algorithm: assign each sidecar(group) to the task with lowest current weight
 */
function distributeSidecars(sidecarConfig, numTasks) {
  const sidecarData = [];
  let totalWeight = 0;

  for (const [name, weight] of Object.entries(sidecarConfig)) {
    const sidecars = expandSidecar(name);
    sidecarData.push({ name, sidecars, weight });
    totalWeight += weight;
  }

  const items = [];
  for (const data of sidecarData) {
    const replicas = Math.max(1, Math.round((data.weight / totalWeight) * numTasks));
    for (let i = 0; i < replicas; i++) {
      items.push({ name: data.name, sidecars: data.sidecars, weight: data.weight });
    }
  }

  items.sort((a, b) => b.weight - a.weight);

  const tasks = Array.from({ length: numTasks }, (_, i) => ({
    index: i + 1,
    sidecars: [],
    sidecarSet: new Set(),
    weight: 0
  }));

  for (const item of items) {
    const minTask = tasks.reduce((min, t) => (t.weight < min.weight ? t : min), tasks[0]);

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

// =============================================================================
// MAIN: Generate all tasks
// =============================================================================

console.log('\n=== Generating Tasks ===\n');

for (const [groupName, config] of Object.entries(packages)) {
  if (config.sidecars && typeof config.sidecars === 'object' && !Array.isArray(config.sidecars)) {
    console.log(`\nDistributing ${Object.keys(config.sidecars).length} sidecar groups across ${config.splits} collector tasks:\n`);

    const collectorTasks = distributeSidecars(config.sidecars, config.splits);

    const sidecarCounts = {};
    collectorTasks.forEach(t => {
      t.sidecars.forEach(s => {
        sidecarCounts[s] = (sidecarCounts[s] || 0) + 1;
      });
    });
    const sidecarCountsStr = Object.entries(sidecarCounts).map(([k, v]) => `${k}=${v}`).join(',');

    for (const task of collectorTasks) {
      const taskName = `collector-split-${task.index}`;

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

