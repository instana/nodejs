/*
 * (c) Copyright IBM Corp. 2022
 */

/* eslint-disable no-console */

'use strict';

const childProcess = require('child_process');
const { promisify } = require('util');

exports.executeCallback = function (command, workingDir, cb) {
  const originalWorkingDir = process.cwd();
  process.chdir(workingDir);
  console.log(`About to run "${command}" in ${process.cwd()} now.`);
  childProcess.exec(command, (error, stdout, stderr) => {
    console.log(`STDOUT of ${command}: ${stdout}`);
    console.error(`STDERR of ${command}: ${stderr}`);
    process.chdir(originalWorkingDir);
    cb(error);
  });
};

exports.executeAsync = promisify(exports.executeCallback);
