/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { execSync } = require('child_process');

/**
 * Run a shell command synchronously in a given directory.
 *
 * @param {string} cmd The command to run
 * @param {string} cwd The working directory for running the program
 */
exports.runCommandSync = function runCommandSync(cmd, cwd) {
  // eslint-disable-next-line no-console
  console.log(`Running ${cmd} in ${cwd}.`);
  const cmdOutput = execSync(cmd, { cwd });
  // eslint-disable-next-line no-console
  console.log(`Done with running ${cmd} in ${cwd}:\n${cmdOutput}`);
};
