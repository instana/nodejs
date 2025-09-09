/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
const path = require('path');

const groups = {
  'test:ci:collector:general': {
    sidecars: ['mysql']
  },
  'test:ci:collector:tracing:frameworks': {
    sidecars: ['postgres'],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/frameworks"'
  },
  'test:ci:collector:tracing:database': {
    sidecars: [
      'memcached',
      'mongodb',
      'elasticsearch',
      'redis',
      'redis-slave',
      'redis-sentinel',
      'couchbase',
      'mysql',
      'postgres'
    ],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/databases"',
    split: 10,
    subname: 'test:ci:tracing:database',
    scope: '@instana/collector'
  },
  'test:ci:collector:tracing:cloud:aws:v2': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/cloud/aws"',
    split: 3,
    scope: '@instana/collector',
    subname: 'test:ci:tracing:cloud:aws:v2'
  },
  'test:ci:collector:tracing:cloud:aws:v3': {
    sidecars: ['localstack'],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/cloud/aws"',
    split: 3,
    scope: '@instana/collector',
    subname: 'test:ci:tracing:cloud:aws:v3'
  },
  'test:ci:collector:tracing:cloud:gcp': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/cloud/gcp"'
  },
  'test:ci:collector:tracing:cloud:azure': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/cloud/azure"'
  },
  'test:ci:collector:tracing:messaging': {
    sidecars: [
      'zookeeper',
      'kafka',
      'schema-registry',
      'redis',
      'nats',
      'nats-streaming',
      'nats-streaming-2',
      'rabbitmq'
    ],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/messaging"',
    split: 4,
    scope: '@instana/collector',
    subname: 'test:ci:tracing:messaging'
  },
  'test:ci:collector:tracing:protocols': {
    sidecars: ['rabbitmq'],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/protocols"',
    split: 2,
    scope: '@instana/collector',
    subname: 'test:ci:tracing:protocols'
  },
  'test:ci:collector:tracing:general': {
    sidecars: ['postgres', 'oracledb'],
    condition: ' && true'
  },
  'test:ci:collector:tracing:misc': {
    sidecars: ['redis'],
    condition: ' && true'
  },
  'test:ci:collector:tracing:logging': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core/src/tracing/instrumentation/logging"'
  },
  'test:ci:autoprofile': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/autoprofile"'
  },
  'test:ci:aws-fargate': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/aws-fargate"'
  },
  'test:ci:aws-lambda': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/aws-lambda"',
    split: 5,
    subname: 'test:ci',
    scope: '@instana/aws-lambda'
  },
  'test:ci:azure-container-services': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/azure-container-services"'
  },
  'test:ci:core': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/core"'
  },
  'test:ci:google-cloud-run': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/google-cloud-run"'
  },
  'test:ci:metrics-util': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/metrics-util"'
  },
  'test:ci:opentelemetry-exporter': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/opentelemetry-exporter"'
  },
  'test:ci:opentelemetry-sampler': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/opentelemetry-sampler"'
  },
  'test:ci:serverless': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/serverless"'
  },
  'test:ci:shared-metrics': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/shared-metrics"'
  },
  'test:ci:serverless-collector': {
    sidecars: [],
    condition: ' && ! echo "$MODIFIED_FILES" | grep -q "packages/serverless-collector"'
  }
};

const sidecars = require('./assets/sidecars.json');

for (const [groupName, { sidecars: groupSidecars, condition, split, subname, scope }] of Object.entries(groups)) {
  const templateContent = fs.readFileSync(path.join(__dirname, 'templates/test-task.yaml.template'), 'utf-8');
  const sidecarTemplate = fs.readFileSync(path.join(__dirname, 'templates/sidecar.yaml.template'), 'utf-8');

  const runs = split ? Array.from({ length: split }, (_, i) => i + 1) : [1];

  runs.forEach(number => {
    let sanitizedGroupName = groupName.replace(/:/g, '-');

    // Replace test- prefix
    sanitizedGroupName = sanitizedGroupName.replace(/^test-/, '');
    // Replace ci- prefix
    sanitizedGroupName = sanitizedGroupName.replace(/^ci-/, '');

    if (number > 1) {
      sanitizedGroupName = `${sanitizedGroupName}-split-${number}`;
    }

    const groupSidecarDetails = groupSidecars
      .map(sidecarName => {
        const sidecar = sidecars.sidecars.find(s => s.name === sidecarName);

        if (!sidecar) {
          return '';
        }

        let templ = sidecarTemplate.replace('{{name}}', sidecar.name).replace('{{image}}', sidecar.image);

        if (sidecar.env) {
          let res = 'env:\n';

          res += sidecar.env
            .map(e => {
              return `          - name: "${e.name}"\n            value: "${e.value}"\n`;
            })
            .join('');

          templ = templ.replace('{{env}}', res);
        } else {
          templ = templ.replace('{{env}}', '');
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

            res += sidecar.readinessProbe.exec.command
              .map(cmd => {
                return `            - "${cmd}"\n`;
              })
              .join('');
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

        templ = templ.replace('{{command}}', '');
        templ = templ.replace('{{readinessProbe}}', '');

        templ = templ
          .split('\n')
          .filter(line => line.trim() !== '')
          .join('\n');

        return `${templ}`;
      })
      .join('\n');

    let filledTemplate = templateContent;
    filledTemplate = filledTemplate.replace('{{condition}}', condition || '');

    filledTemplate = filledTemplate
      .replace(/{{sanitizedGroupName}}/g, sanitizedGroupName)
      .replace(/{{sidecars}}/g, `sidecars:\n${groupSidecarDetails}`)
      .replace(/{{groupName}}/g, groupName)
      .replace(/{{subname}}/g, subname || 'false')
      .replace(/{{split}}/g, split || 'false')
      .replace(/{{splitNumber}}/g, number || '1')
      .replace(/{{scope}}/g, scope || 'false');

    filledTemplate = filledTemplate
      .split('\n')
      .filter(line => line.trim() !== '')
      .join('\n');

    const fileName = `${sanitizedGroupName}-task.yaml`;
    const location = path.join(__dirname, 'tasks', 'test-groups', fileName);

    if (fs.existsSync(location)) {
      fs.unlinkSync(location);
    }

    fs.writeFileSync(location, filledTemplate);

    console.log(`Generated ${fileName}`);
  });
}
