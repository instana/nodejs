/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
let templateContent = fs.readFileSync('./templates/pipeline.yaml.template', 'utf-8');
const taskTemplateContent = fs.readFileSync('./templates/pipeline-test-task.yaml.template', 'utf-8');

const files = fs.readdirSync('./tasks/test-groups');
const names = files.map(f => f.replace('-task.yaml', ''));

let content = '';

names.forEach(name => {
  content += taskTemplateContent.replace(/{{name}}/g, name);
  content += '\n';
});

templateContent = templateContent.replace('{{test-tasks}}', content);

const location = './pipeline/default-pipeline.yaml';

if (fs.existsSync(location)) {
  fs.unlinkSync(location);
}

fs.writeFileSync(location, templateContent);
console.log('Done', location);
