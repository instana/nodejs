'use strict';

const expect = require('chai').expect;

const utils = require('../../../core/test/utils');
const directDependencies = require('../../src/metrics/directDependencies');

describe('metrics.directDependencies', () => {
  it('should use the correct payload prefix', () => {
    expect(directDependencies.payloadPrefix).to.equal('directDependencies');
  });

  it('should export a well formed empty payload right away', () => {
    expect(directDependencies.currentPayload.dependencies).to.exist;
    expect(directDependencies.currentPayload.peerDependencies).to.exist;
    expect(directDependencies.currentPayload.optionalDependencies).to.exist;
  });

  it('should provide the set of depencies with versions', () => {
    directDependencies.activate();

    return utils.retry(() => {
      // Testing against Mocha dependencies as mocha is the main module when running the tests and dependencies are
      // evaluated as the content of the node_modules directory relative to the main module.
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
      expect(deps.mkdirp).to.equal('0.5.1');
      expect(deps['supports-color']).to.equal('6.0.0');
      expect(directDependencies.currentPayload.peerDependencies).to.deep.equal({});
      expect(directDependencies.currentPayload.optionalDependencies).to.deep.equal({});
    });
  });
});
