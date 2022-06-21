/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { execSync } = require('child_process');

exports.runCommandSync = function runCommandSync(cmd, cwd) {
  // eslint-disable-next-line no-console
  console.log(`Running ${cmd} in ${cwd}.`);
  const cmdOutput = execSync(cmd, { cwd });
  // eslint-disable-next-line no-console
  console.log(`Done with running ${cmd} in ${cwd}:\n${cmdOutput}`);
};
