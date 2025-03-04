/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function checkESMApp(obj = {}) {
  try {
    const { appPath, dirPath } = obj;

    if (appPath) {
      if (fs.existsSync(appPath)) {
        return true;
      }

      // checking inside esm/ subfolder relative to appPath
      // NOTE: 'esm/'is not implemented or used yet.
      const esmAppPath = path.join(path.dirname(appPath), 'esm', path.basename(appPath));
      if (fs.existsSync(esmAppPath)) {
        return esmAppPath;
      }

      return false;
    } else if (dirPath) {
      const esmDir = path.join(dirPath, 'esm');

      const findESMFile = directory => {
        if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
          return null;
        }
        const files = fs.readdirSync(directory);
        return files.find(f => f.endsWith('.mjs')) || null;
      };

      // check 'esm/' directory first, then fallback to the main directory
      // NOTE: 'esm/'is not implemented or used yet.
      return findESMFile(esmDir) || findESMFile(dirPath);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking ESM file:', error.message);
    return false;
  }
};
