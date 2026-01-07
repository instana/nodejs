/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');

const tmpDir = process.argv[2];
const processedDir = process.argv[3];

if (!tmpDir || !processedDir) {
  console.error('Usage: node manipulate-c8.js <tmpDir> <processedDir>');
  process.exit(1);
}

if (!fs.existsSync(tmpDir)) {
  console.error('No coverage data found!');
  process.exit(1);
}

if (!fs.existsSync(processedDir)) {
  fs.mkdirSync(processedDir, { recursive: true });
}

const workspaceRoot = process.cwd();

const files = fs.readdirSync(tmpDir);

files.forEach(file => {
  if (file.endsWith('.json')) {
    const sourcePath = path.join(tmpDir, file);
    const destPath = path.join(processedDir, file);
    const content = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));

    if (content.result) {
      content.result.forEach(entry => {
        if (entry.url) {
          let normalizedPath = entry.url;
          const originalPath = normalizedPath;
          const hadFilePrefix = originalPath.startsWith('file://');

          normalizedPath = normalizedPath.replace(/^file:\/\//, '');

          let absolutePrefix = '';
          let relativePath = normalizedPath;

          if (normalizedPath.startsWith(workspaceRoot)) {
            absolutePrefix = workspaceRoot;
            relativePath = normalizedPath.substring(workspaceRoot.length);
            if (relativePath.startsWith('/')) {
              relativePath = relativePath.substring(1);
            }
          }

          relativePath = relativePath.replace(/^nodejs\//, '');

          if (relativePath.includes('node_modules/@instana/')) {
            const match = relativePath.match(/node_modules\/@instana\/(.+)$/);
            if (match) {
              relativePath = `packages/${match[1]}`;
            }
          }

          const packagesMatch = relativePath.match(/.*(packages\/[^/]+\/.+)$/);
          if (packagesMatch) {
            relativePath = packagesMatch[1];
          }

          if (absolutePrefix) {
            normalizedPath = path.join(absolutePrefix, relativePath);
          } else {
            normalizedPath = relativePath;
          }

          if (hadFilePrefix) {
            normalizedPath = `file://${normalizedPath}`;
          }

          entry.url = normalizedPath;
        }
      });
    }

    fs.writeFileSync(destPath, JSON.stringify(content));
  }
});

console.log(`Processed ${files.filter(f => f.endsWith('.json')).length} coverage files in ${processedDir}`);
