/*
 * (c) Copyright IBM Corp. 2026
 */

import { expect } from 'chai';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

expect(process.cwd()).to.equal(process.env.APP_CWD);

const collectorPath = process.execArgv.find(arg => arg.includes('collector'));
expect(collectorPath).to.contain(path.join(process.cwd(), 'node_modules', '@instana', 'collector'));

const version = require(path.join(process.cwd(), 'node_modules', process.env.LIBRARY_NAME, 'package.json')).version;
expect(version).to.equal(process.env.LIBRARY_VERSION);
