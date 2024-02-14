/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');

const sidecars = require('./assets/sidecars.json');
const templateContent = fs.readFileSync('./templates/test-coverage.yaml.template', 'utf-8');
const sidecarTemplate = fs.readFileSync('./templates/sidecar.yaml.template', 'utf-8');

const sidecarContent = sidecars.sidecars
  .map(sidecar => {
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

      res += sidecar.args
        .map(a => {
          return `          - "${a}"\n`;
        })
        .join('');

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

filledTemplate = filledTemplate.replace(/{{sidecars}}/g, `sidecars:\n${sidecarContent}`);

filledTemplate = filledTemplate
  .split('\n')
  .filter(line => line.trim() !== '')
  .join('\n');

const location = './tasks/test-coverage.yaml';

if (fs.existsSync(location)) {
  fs.unlinkSync(location);
}

fs.writeFileSync(location, filledTemplate);

console.log(`Generated ${location}`);
