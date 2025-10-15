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
 *
 * ├── node_modules/
 * │   └── @opentelemetry/
 * │       ├── api/                          # Root-level API
 * │       │   └── index.js
 * │       └── otel-fs-instrumentation/      # FS instrumentation v1
 * │           └── index.js
 * └── packages/
 *     └── package1/
 *         ├── node_modules/                 # FS instrumentation v2
 *         │   └── @opentelemetry/
 *         │       ├── api/
 *         │       │   └── index.js
 *         │       └── otel-fs-instrumentation/
 *         │           └── index.js
 *         └── oracle/
 *             └── node_modules/
 *                 └── @opentelemetry/
 *                     ├── api/
 *                     │   └── index.js
 *                     └── otel-oracledb-instrumentation/
 *                         └── index.js
 */
describe('utils.opentelemetryApiResolver', () => {
  let tempDir;
  let originalCwd;
  let originalResolve;

  const modules = {};

  before(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, 'tempDir-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    const makeModule = (filePath, content = '') => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
      return filePath;
    };

    modules.rootApi = makeModule(
      path.join(tempDir, 'node_modules/@opentelemetry/api/index.js'),
      "module.exports = { __source: 'root-api' };"
    );
    modules.fsV1 = makeModule(
      path.join(tempDir, 'node_modules/@opentelemetry/otel-fs-instrumentation/index.js'),
      "module.exports = { __source: 'fs-v1' };"
    );

    modules.fsV2Api = makeModule(
      path.join(tempDir, 'packages/package1/node_modules/@opentelemetry/api/index.js'),
      "module.exports = { __source: 'fs-v2-api' };"
    );
    modules.fsV2Instr = makeModule(
      path.join(tempDir, 'packages/package1/node_modules/@opentelemetry/otel-fs-instrumentation/index.js'),
      "module.exports = { __source: 'fs-v2' };"
    );

    modules.oracleApi = makeModule(
      path.join(tempDir, 'packages/package1/oracle/node_modules/@opentelemetry/api/index.js'),
      "module.exports = { __source: 'oracle-api' };"
    );
    modules.oracleInstr = makeModule(
      path.join(tempDir, 'packages/package1/oracle/node_modules/@opentelemetry/otel-oracledb-instrumentation/index.js'),
      "module.exports = { __source: 'oracle' };"
    );

    originalResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, isMain, options) {
      const mapping = {
        'otel-fs-instrumentation': [modules.fsV2Instr, modules.fsV1],
        'otel-oracledb-instrumentation': [modules.oracleInstr]
      };

      if (mapping[request]) {
        const resolvedPath = mapping[request].find(p => fs.existsSync(p));
        if (resolvedPath) return resolvedPath;
      }

      return originalResolve.call(this, request, parent, isMain, options);
    };
  });

  after(() => {
    process.chdir(originalCwd);
    Module._resolveFilename = originalResolve;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves FS instrumentation v2 API in package1', () => {
    const api = getApiForInstrumentation('otel-fs-instrumentation');
    expect(api.__source).to.equal('fs-v2-api');
  });

  it('falls back to FS instrumentation v1 API in root node_modules', () => {
    const resolver = require('../../src/util/opentelemetryApiResolver');
    const fsInstrDir = path.join(tempDir, 'packages/package1/node_modules/@opentelemetry/otel-fs-instrumentation');
    const tempBackup = path.join(path.dirname(fsInstrDir), 'otel-fs-instrumentation-v1');

    if (fs.existsSync(fsInstrDir)) fs.renameSync(fsInstrDir, tempBackup);

    const api = resolver.getApiForInstrumentation('otel-fs-instrumentation');
    expect(api.__source).to.equal('root-api');

    if (fs.existsSync(tempBackup)) fs.renameSync(tempBackup, fsInstrDir);
  });

  it('resolves OracleDB instrumentation API in nested package', () => {
    const api = getApiForInstrumentation('otel-oracledb-instrumentation');
    expect(api.__source).to.equal('oracle-api');
  });

  it('should fallback to root API if instrumentation has no local API', () => {
    const api = getApiForInstrumentation('non-existent-fs-instrumentation');
    expect(api.__source).to.equal('root-api');
  });
});
