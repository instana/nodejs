/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
const path = require('path');

let templateContent = fs.readFileSync(path.join(__dirname, 'templates/default-pipeline.yaml.template'), 'utf-8');
const taskTemplateContent = fs.readFileSync(
  path.join(__dirname, 'templates/default-pipeline-test-task.yaml.template'),
  'utf-8'
);

const files = fs.readdirSync('./tasks/test-groups');

const names = [];
files.forEach((file, index) => {
  if (file.endsWith('task.yaml')) {
    names.push(file.replace('-task.yaml', ''));
  } else {
    names.push(file.replace(/-task-(\d+)-split.yaml/, '-split-$1'));
  }
});

let content = '';

names.forEach(name => {
  content += taskTemplateContent.replace(/{{name}}/g, name);
  content += '\n';
});

templateContent = templateContent.replace('{{test-tasks}}', content);

const location = path.join(__dirname, 'pipeline', 'default-pipeline.yaml');

if (fs.existsSync(location)) {
  fs.unlinkSync(location);
}

fs.writeFileSync(location, templateContent);
console.log('Done', location);
