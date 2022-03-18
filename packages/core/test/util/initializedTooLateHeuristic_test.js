/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const requireHook = require('../../src/util/requireHook');
const initializedTooLateHeurstic = require('../../src/util/initializedTooLateHeuristic');

describe('[UNIT] util.initializedTooLateHeurstic', () => {
  const instrumentedModules = [];

  before(() => {
    sinon.stub(requireHook, 'onFileLoad').callsFake(function fake(m) {
      instrumentedModules.push(m);
    });
    sinon.stub(requireHook, 'onModuleLoad').callsFake(function fake(m) {
      instrumentedModules.push(m);
    });

    require.cache['/@contrast/agent/'] = {};

    const tracing = require('../../src/');
    tracing.init();
  });

  after(() => {
    delete require.cache['/@contrast/agent/'];
  });

  beforeEach(() => {
    initializedTooLateHeurstic.reset();
  });

  it('hasBeenInitializedTooLate is false', () => {
    expect(initializedTooLateHeurstic()).to.be.false;
  });

  it('hasBeenInitializedTooLate is false', () => {
    const p = '/Users/myuser/dev/instana/nodejs/node_modules/nope';
    require.cache[p] = {};
    expect(initializedTooLateHeurstic()).to.be.false;
    delete require.cache[p];
  });

  it('hasBeenInitializedTooLate is true', () => {
    const originalRequireCache = require.cache;

    instrumentedModules.forEach(moduleName => {
      // eslint-disable-next-line no-console
      console.log(`for module ${moduleName}`);

      // RESET CACHE & module
      require.cache = originalRequireCache;
      initializedTooLateHeurstic.reset();

      let p = moduleName;
      try {
        p = require.resolve(moduleName);
      } catch (err) {
        p = path.resolve(p.toString().replace(/\\\/?/g, '/'));
      }

      require.cache[p] = {};

      if (p.indexOf('bluebird') !== -1 || p.indexOf('bunyan') !== -1 || p.indexOf('winston') !== -1) {
        expect(initializedTooLateHeurstic()).to.be.false;
        delete require.cache[p];
      } else {
        expect(initializedTooLateHeurstic()).to.be.true;
        delete require.cache[p];
      }
    });
  });
});
