/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const fs = require('fs');
const path = require('path');

const coverageDir = path.join(__dirname, '..', 'coverage');

const dirs = fs
  .readdirSync(coverageDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory() && dirent.name !== 'tmp' && dirent.name !== 'lcov-report')
  .map(dirent => dirent.name);

dirs.forEach(subdir => {
  const files = fs.readdirSync(path.join(coverageDir, subdir, 'tmp'));

  files.forEach(file => {
    const filePath = path.join(coverageDir, subdir, 'tmp', file);
    const newFileName = `${subdir}-${file}`;
    const newFilePath = path.join(coverageDir, 'tmp', newFileName);
    fs.renameSync(filePath, newFilePath);
    console.log(`Renamed & Moved ${file} to ${newFileName}`);
  });
});
