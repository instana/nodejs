/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');
const { expect } = require('chai');
const { getApiForInstrumentation } = require('../../src/util/opentelemetryApiResolver');

/*
Test dir structure:

tempDir/
├── node_modules/
│   └── @opentelemetry/api/
│       └── index.js
│   └── otel-fs-instrumentation/
│       └── index.js
└── packages1/
    ├── node_modules/
        otel-fs-instrumentation/
    │   ├── index.js
    │   └─
    │    └── otel-fs-instrumentation/
               @opentelemetry/api/
    │           └── index.js

    packages2
     node_modules/
    └── otel-oracledb-instrumentation/
        ├── index.js

        └── @opentelemetry/api/
                └── index.js
*/

describe('utils.opentelemetryApiResolver tests', () => {
  let tempDir;
  let originalCwd;
  let originalResolve;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, 'tempDir-'));

    const rootApiPath = path.join(tempDir, 'node_modules', '@opentelemetry/api');
    fs.mkdirSync(rootApiPath, { recursive: true });
    fs.writeFileSync(
      path.join(rootApiPath, 'index.js'),
      "module.exports = { __source: 'root', trace: { root: true } };"
    );

    const rootFsApiPath = path.join(tempDir, 'node_modules', 'otel-fs-instrumentation');
    fs.mkdirSync(rootFsApiPath, { recursive: true });
    fs.writeFileSync(
      path.join(rootFsApiPath, 'index.js'),
      "module.exports = { __source: 'root-fs', trace: { fsRoot: true } };"
    );
    const fsChildApiPath = path.join(
      tempDir,
      'packages',
      'otel-fs-instrumentation',
      'node_modules',
      '@opentelemetry/api'
    );
    fs.mkdirSync(fsChildApiPath, { recursive: true });
    fs.writeFileSync(
      path.join(fsChildApiPath, 'index.js'),
      "module.exports = { __source: 'child-fs', trace: { fsChild: true } };"
    );

    const fsInstPath = path.join(tempDir, 'packages', 'otel-fs-instrumentation');
    fs.mkdirSync(fsInstPath, { recursive: true });
    fs.writeFileSync(path.join(fsInstPath, 'index.js'), 'module.exports = {};');

    const oracledbChildApiPath = path.join(
      tempDir,
      'packages',
      'otel-oracledb-instrumentation',
      'node_modules',
      '@opentelemetry/api'
    );
    fs.mkdirSync(oracledbChildApiPath, { recursive: true });
    fs.writeFileSync(
      path.join(oracledbChildApiPath, 'index.js'),
      "module.exports = { __source: 'child-oracledb', trace: { oracledbChild: true } };"
    );

    const oracledbInstPath = path.join(tempDir, 'packages', 'otel-oracledb-instrumentation');
    fs.mkdirSync(oracledbInstPath, { recursive: true });
    fs.writeFileSync(path.join(oracledbInstPath, 'index.js'), 'module.exports.init = () => {}');

    originalResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, isMain, options) {
      if (request === 'otel-fs-instrumentation') {
        return path.join(fsInstPath, 'index.js');
      }
      if (request === 'otel-oracledb-instrumentation') {
        return path.join(oracledbInstPath, 'index.js');
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };

    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  after(() => {
    process.chdir(originalCwd);
    Module._resolveFilename = originalResolve;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should resolve the FS child API instance for local instrumentation', () => {
    const api = getApiForInstrumentation('otel-fs-instrumentation');
    expect(api.__source).to.equal('child-fs');
  });

  it('should fallback to root FS API if instrumentation has no local API', () => {
    const api = getApiForInstrumentation('non-existent-fs-instrumentation');
    expect(api.__source).to.equal('root');
  });

  it('should resolve the Oracle child API instance for local instrumentation', () => {
    const api = getApiForInstrumentation('otel-oracledb-instrumentation');
    expect(api.__source).to.equal('child-oracledb');
  });

  it('should cache the resolved API instance', () => {
    const api1 = getApiForInstrumentation('otel-fs-instrumentation');
    const api2 = getApiForInstrumentation('otel-fs-instrumentation');
    expect(api1).to.equal(api2);
  });
});
