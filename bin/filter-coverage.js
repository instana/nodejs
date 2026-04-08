#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');

const processedDir = process.argv[2];
const packageToInclude = process.argv[3]; // e.g., 'collector'

if (!processedDir || !packageToInclude) {
  console.error('Usage: node filter-coverage.js <processedDir> <packageToInclude>');
  process.exit(1);
}

const files = fs.readdirSync(processedDir);

files.forEach(file => {
  if (file.endsWith('.json')) {
    const filePath = path.join(processedDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (content.result) {
      content.result = content.result.filter(entry => {
        if (!entry.url) return false;
        const url = entry.url.replace(/^file:\/\//, '');
        // Only include files from the specified package
        return url.includes(`packages/${packageToInclude}/src/`);
      });
    }

    fs.writeFileSync(filePath, JSON.stringify(content));
  }
});

console.log(`Filtered coverage to only include packages/${packageToInclude}/src/`);

// Made with Bob
