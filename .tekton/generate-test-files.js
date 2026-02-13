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

// Static configuration: number of CI tasks per sidecar type.
// Adjust these numbers to control parallelism for each sidecar.
const collectorSidecarTasks = {
  redis: 20,
  kafka: 6,
  postgres: 3,
  elasticsearch: 2,
  mongodb: 1,
  couchbase: 1,
  rabbitmq: 1,
  nats: 1,
  mysql: 1,
  localstack: 1,
  memcached: 1,
  oracledb: 1
};

const packages = {
  'test:ci:collector': {
    sidecarTasks: collectorSidecarTasks
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
  if (config.sidecarTasks) {
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
 * Build task list from static sidecar configuration.
 */
function buildTasksFromConfig(sidecarTasks) {
  const tasks = [];
  let index = 1;

  for (const [sidecar, count] of Object.entries(sidecarTasks)) {
    const sidecars = expandSidecar(sidecar);
    for (let i = 0; i < count; i++) {
      tasks.push({ index: index++, sidecarNames: [sidecar], sidecars });
    }
  }

  return tasks;
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
  if (config.sidecarTasks) {
    const tasks = buildTasksFromConfig(config.sidecarTasks);
    const totalTasks = tasks.length;

    console.log(`\nGenerating ${totalTasks} collector tasks:\n`);
    for (const [sidecar, count] of Object.entries(config.sidecarTasks)) {
      console.log(`  ${sidecar}: ${count} tasks [${expandSidecar(sidecar).join(', ')}]`);
    }

    cleanupOldCollectorTasks();

    const sidecarCounts = {};
    tasks.forEach(t => {
      t.sidecars.forEach(s => {
        sidecarCounts[s] = (sidecarCounts[s] || 0) + 1;
      });
    });
    const sidecarCountsStr = Object.entries(sidecarCounts).map(([k, v]) => `${k}=${v}`).join(',');

    const collectorTasks_ = [];

    for (const task of tasks) {
      const sidecarSuffix = task.sidecarNames.join('-');
      const taskName = `collector-${task.index}-${sidecarSuffix}`;

      collectorTasks_.push({ taskName, displayName: taskName });

      const content = generateTask(taskName, task.sidecars, {
        groupName,
        subname: generateSubname(groupName, config),
        split: totalTasks,
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

