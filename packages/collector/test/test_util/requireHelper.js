
/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

expect(process.cwd()).to.equal(process.env.APP_CWD);

const instanaRequirePath = require.resolve('@instana/collector', { paths: [process.cwd()] })
global.instana = require(instanaRequirePath)();

const requirePath = require.resolve(process.env.LIBRARY_NAME, { paths: [process.cwd()] })
global.library = require(requirePath);

const version = require(path.join(process.cwd(), 'node_modules', process.env.LIBRARY_NAME, 'package.json')).version;
expect(version).to.equal(process.env.LIBRARY_VERSION);

global.corePath = process.env.CORE_PATH;
global.collectorPath = process.env.COLLECTOR_PATH;
