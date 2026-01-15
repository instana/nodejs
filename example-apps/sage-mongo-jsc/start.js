#!/usr/bin/env node
/* [object Object]
[object Object]
[object Object]
[object Object] */

'use strict';

const fs = require('fs');
const path = require('path');

const mainJSC = path.join(__dirname, 'index.jsc');

if (!fs.existsSync(mainJSC)) {
  console.error('[Loader] Error: index.jsc not found!');
  console.error('[Loader] Please run: npm run compile');
  process.exit(1);
}

console.log('[Loader] Starting application with V8 bytecode (bytenode)...\n');

require('bytenode');

try {
  require(path.resolve(mainJSC));
  console.log('\n[Loader] Application started successfully!');
} catch (err) {
  console.error('\n[Loader] Failed to start application:', err);
  process.exit(1);
}
