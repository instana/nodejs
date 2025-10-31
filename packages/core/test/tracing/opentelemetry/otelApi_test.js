/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');
const { expect } = require('chai');

describe('opentelemetry/api module', () => {
  let tempDir;
  let originalCwd;
  let originalResolve;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, 'tempDir-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    const makeModule = (filePath, content) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    };

    /**
     * test structure:
     *
     * ├── node_modules/
     * │   └── @opentelemetry/
     * │       └── api/                      # root API
     * │           └── index.js
     * └── packages/
     *     └── service/
     *         └── node_modules/
     *             └── @opentelemetry/
     *                 └── api/              # fallback API
     *                     └── index.js
     */
    makeModule(
      path.join(tempDir, 'node_modules/@opentelemetry/api/index.js'),
      "module.exports = { __source: 'root-api' };"
    );

    makeModule(
      path.join(tempDir, 'packages/service/node_modules/@opentelemetry/api/index.js'),
      "module.exports = { __source: 'child-api' };"
    );

    originalResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, isMain, options) {
      if (request === '@opentelemetry/api') {
        const rootApi = path.join(tempDir, 'node_modules/@opentelemetry/api/index.js');
        const childApi = path.join(tempDir, 'packages/service/node_modules/@opentelemetry/api/index.js');

        if (options?.paths?.includes(process.cwd())) {
          if (fs.existsSync(path.join(process.cwd(), 'node_modules/@opentelemetry/api/index.js'))) {
            return path.join(process.cwd(), 'node_modules/@opentelemetry/api/index.js');
          }
          throw new Error('Cannot find local module');
        }

        if (fs.existsSync(rootApi)) return rootApi;
        if (fs.existsSync(childApi)) return childApi;
      }

      return originalResolve.call(this, request, parent, isMain, options);
    };
  });

  after(() => {
    process.chdir(originalCwd);
    Module._resolveFilename = originalResolve;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load @opentelemetry/api from the root-level node_modules by default', () => {
    process.chdir(tempDir);

    delete require.cache[require.resolve('../../../src/tracing/opentelemetry-instrumentations/opentelemetryApi')];
    const otelApi = require('../../../src/tracing/opentelemetry-instrumentations/opentelemetryApi');

    expect(otelApi.__source).to.equal('root-api');
  });

  it('should fall back to @opentelemetry/api in child node_modules if root-level is missing', () => {
    fs.rmSync(path.join(tempDir, 'node_modules/@opentelemetry'), { recursive: true, force: true });

    const nestedPath = path.join(tempDir, 'packages/service');
    process.chdir(nestedPath);

    delete require.cache[require.resolve('../../../src/tracing/opentelemetry-instrumentations/opentelemetryApi')];
    const otelApi = require('../../../src/tracing/opentelemetry-instrumentations/opentelemetryApi');
    expect(otelApi.__source).to.equal('child-api');
  });
});
