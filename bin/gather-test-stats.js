/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
const path = require('path');

const packagesFolder = path.join(__dirname, '..', 'packages');
// eslint-disable-next-line no-unused-vars
let noOfTestFiles = 0;
let noOfTestCases = 0;

function walkSync(dir, list = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const currentPath = path.join(dir, file);

    if (fs.statSync(currentPath).isDirectory()) {
      if (file === 'node_modules') {
        return;
      }

      list = walkSync(currentPath, list);
    } else if (currentPath.endsWith('test.js')) {
      list.push(currentPath);
    }
  });

  return list;
}

const packages = fs.readdirSync(packagesFolder);
packages.forEach(pkg => {
  const packageTestFolder = path.join(packagesFolder, pkg, 'test');
  const files = walkSync(packageTestFolder);

  noOfTestFiles += files.length;

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/it\('/g);

    if (match) {
      noOfTestCases += match.length;
    }
  });
});

// console.log(`TOTAL NUMBER OF TEST FILES: ${noOfTestFiles}`);
console.log(noOfTestCases);
