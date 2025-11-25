/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const fs = require('fs');

const testUtils = require('@instana/core/test/test_util');
const directDependencies = require('../src/directDependencies');
const config = require('@instana/core/test/config');

describe('metrics.directDependencies', function () {
  this.timeout(config.getTestTimeout());

  before(() => {
    directDependencies.init({ logger: testUtils.createFakeLogger() });
  });

  it('should use the correct payload prefix', () => {
    expect(directDependencies.payloadPrefix).to.equal('directDependencies');
  });

  it('should export a well formed empty payload right away', () => {
    expect(directDependencies.currentPayload.dependencies).to.exist;
    expect(directDependencies.currentPayload.peerDependencies).to.exist;
    expect(directDependencies.currentPayload.optionalDependencies).to.exist;
  });

  it('should provide the set of dependencies with versions', () => {
    // We simply simulate that mocha is our app. It does not matter which package.json we use as long as it has
    // dependencies.
    const anyPackageJsonPath = path.join(path.dirname(require.resolve('mocha')), 'package.json');
    const anyPackageJsonFile = JSON.parse(fs.readFileSync(anyPackageJsonPath, 'utf8'));

    directDependencies.activate({}, { file: anyPackageJsonFile, path: anyPackageJsonPath });

    return testUtils.retry(() => {
      const deps = directDependencies.currentPayload.dependencies;
      expect(deps).to.exist;
      expect(deps['browser-stdout']).to.equal('1.3.1');
      expect(deps.debug).to.equal('4.3.1');
      expect(deps.diff).to.equal('5.0.0');
      expect(deps['escape-string-regexp']).to.equal('4.0.0');
      expect(deps.glob).to.equal('7.1.6');
      expect(deps.growl).to.equal('1.10.5');
      expect(deps.he).to.equal('1.2.0');
      expect(deps.minimatch).to.equal('3.0.4');
      expect(deps['supports-color']).to.equal('8.1.1');
      expect(directDependencies.currentPayload.peerDependencies).to.deep.equal({});
      expect(directDependencies.currentPayload.optionalDependencies).to.deep.equal({});
    });
  });
});
