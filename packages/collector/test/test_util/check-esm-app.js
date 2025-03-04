/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function checkESMApp(fullPath) {
  try {
    const dirPath = path.dirname(fullPath);
    const fileName = path.basename(fullPath);

    const files = fs.readdirSync(dirPath);
    return files.includes(fileName) && fileName.endsWith('.mjs');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error checking ESM file in ${fullPath}:`, error.message);
    return false;
  }
};
