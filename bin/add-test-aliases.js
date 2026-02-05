/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const addAliasIfNotExists = (aliasCommand, configFile) => {
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(configFile, 'utf8');
  } catch (err) {
    console.error(`Could not read ${configFile}: ${err.message}`);
    return;
  }

  if (!fileContent.includes(aliasCommand)) {
    fs.appendFileSync(configFile, `\n${aliasCommand}\n`);
    console.log(`Added alias: ${aliasCommand}`);
  } else {
    console.log(`Alias already exists: ${aliasCommand}`);
  }
};

const output = execSync('npx lerna list --json', { encoding: 'utf-8' });
const packages = JSON.parse(output);
const scopeNames = packages.map(pkg => pkg.name);
const shellArg = process.argv[2];

if (!shellArg) {
  console.error('Error: Please specify either "bash" or "zsh".');
  process.exit(1);
}

let configFile;
if (shellArg === 'bash') {
  configFile = `${os.homedir()}/.bashrc`;
} else if (shellArg === 'zsh') {
  configFile = `${os.homedir()}/.zshrc`;
} else {
  console.error('Error: Invalid argument. Please specify "bash" or "zsh".');
  process.exit(1);
}

scopeNames.forEach(scope => {
  const cleanedScope = scope.replace('@instana/', '');

  const watchAlias = `alias run${cleanedScope}='bin/run-tests.sh --scope=${scope} --watch'`;
  const nwAlias = `alias run${cleanedScope}-nw='bin/run-tests.sh --scope=${scope}'`;

  addAliasIfNotExists(watchAlias, configFile);
  addAliasIfNotExists(nwAlias, configFile);
});

console.log('Aliases added. Please run the following command to apply the changes:');
console.log(`  source ${configFile}`);
console.log('Alternatively, restart your terminal.');

console.log('Done');
