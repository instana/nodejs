/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');

const tmpDir = process.argv[2];
const processedDir = process.argv[3];

if (!tmpDir || !processedDir) {
  console.error('Usage: node normalize-c8.js <tmpDir> <processedDir>');
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
const packagesDir = path.join(workspaceRoot, 'packages');

const existingPackages = new Set();
if (fs.existsSync(packagesDir)) {
  const packageNames = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  packageNames.forEach(name => existingPackages.add(name));
}

const files = fs.readdirSync(tmpDir);

files.forEach(file => {
  if (file.endsWith('.json')) {
    const sourcePath = path.join(tmpDir, file);
    const destPath = path.join(processedDir, file);
    const content = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));

    if (content.result) {
      content.result = content.result.filter(entry => {
        if (!entry.url) return true;
        const filePath = entry.url.replace(/^file:\/\//, '');
        try {
          fs.statSync(filePath);
          return true;
        } catch {
          return false;
        }
      });

      content.result.forEach(entry => {
        if (entry.url) {
          if (entry.url.startsWith('node:')) {
            return;
          }

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
            const match = relativePath.match(/node_modules\/@instana\/([^/]+)\/(src|lib)\/(.+)$/);
            if (match) {
              const packageName = match[1];
              if (existingPackages.has(packageName)) {
                const sourceDir = match[2];
                const filePath = match[3];
                relativePath = `packages/${packageName}/${sourceDir}/${filePath}`;
              }
            }
          }

          const packagesMatch = relativePath.match(/.*(packages\/[^/]+\/.+)$/);
          if (packagesMatch) {
            relativePath = packagesMatch[1];
          }

          if (absolutePrefix) {
            normalizedPath = path.join(absolutePrefix, relativePath);
          } else {
            normalizedPath = path.resolve(workspaceRoot, relativePath);
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
