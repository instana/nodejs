/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const path = require('path');
const { execSync } = require('child_process');

module.exports = exports = function execute(command) {
  console.log(`> ${command}`);
  return execSync(command, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
};

exports.getOutput = function getOutput(command) {
  console.log(`> ${command}`);
  return execSync(command, {
    cwd: path.join(__dirname, '..')
  }).toString();
};
