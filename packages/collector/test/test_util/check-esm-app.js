/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function checkESMApp(fullPath) {
  try {
    const dirPath = path.dirname(fullPath);
    const esmDir = path.join(dirPath, 'esm');

    const findESMFile = directory => {
      if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
        return null;
      }
      const files = fs.readdirSync(directory);
      return files.find(f => f.endsWith('.mjs')) || null;
    };

    // check 'esm/' directory first, then fallback to the main directory
    return findESMFile(esmDir) || findESMFile(dirPath);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Error checking ESM file in ${fullPath}:`, error.message);
    return false;
  }
};
