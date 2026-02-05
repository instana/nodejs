
/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

expect(process.cwd()).to.equal(process.env.APP_CWD);

if (process.env.LIBRARY_VERSION && process.env.LIBRARY_NAME) {
    const version = require(path.join(process.cwd(), 'node_modules', process.env.LIBRARY_NAME, 'package.json')).version;
    expect(version).to.equal(process.env.LIBRARY_VERSION);
}