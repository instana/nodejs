'use strict';

const expect = require('chai').expect;

const testUtils = require('../../core/test/test_util');
const directDependencies = require('../src/directDependencies');

describe('metrics.directDependencies', () => {
  it('should use the correct payload prefix', () => {
    expect(directDependencies.payloadPrefix).to.equal('directDependencies');
  });

  it('should export a well formed empty payload right away', () => {
    expect(directDependencies.currentPayload.dependencies).to.exist;
    expect(directDependencies.currentPayload.peerDependencies).to.exist;
    expect(directDependencies.currentPayload.optionalDependencies).to.exist;
  });

  it('should provide the set of dependencies with versions', () => {
    directDependencies.activate();

    return testUtils.retry(() => {
      // Mocha is the main module when running the tests and direct dependencies are evaluated as the content of the
      // the main modules accompanying package.json file. Thus testing against Mocha dependencies here.
      const deps = directDependencies.currentPayload.dependencies;
      expect(deps).to.exist;
      expect(deps['browser-stdout']).to.equal('1.3.1');
      expect(deps.debug).to.equal('3.2.6');
      expect(deps.diff).to.equal('3.5.0');
      expect(deps['escape-string-regexp']).to.equal('1.0.5');
      expect(deps['find-up']).to.equal('3.0.0');
      expect(deps.glob).to.equal('7.1.3');
      expect(deps.growl).to.equal('1.10.5');
      expect(deps.he).to.equal('1.2.0');
      expect(deps.minimatch).to.equal('3.0.4');
      expect(deps.mkdirp).to.equal('0.5.4');
      expect(deps['supports-color']).to.equal('6.0.0');
      expect(directDependencies.currentPayload.peerDependencies).to.deep.equal({});
      expect(directDependencies.currentPayload.optionalDependencies).to.deep.equal({});
    });
  });
});
