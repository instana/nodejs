/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

function findRootFolder() {
  const path = require('path');
const fs = require('fs');

  let currentDir = __dirname;
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'currencies.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error('Could not find root folder (currencies.json)');
}

module.exports = findRootFolder;
