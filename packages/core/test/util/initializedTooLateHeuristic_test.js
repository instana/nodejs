/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const hook = require('../../src/util/hook');
const initializedTooLateHeurstic = require('../../src/util/initializedTooLateHeuristic');
const testConfig = require('../config');
const testUtils = require('../test_util');
const { normalizeConfig } = require('../../src/util');

describe('[UNIT] util.initializedTooLateHeurstic', function () {
  this.timeout(testConfig.getTestTimeout());

  const instrumentedModules = [];

  before(() => {
    sinon.stub(hook, 'onFileLoad').callsFake(function fake(m) {
      instrumentedModules.push(m);
    });
    sinon.stub(hook, 'onModuleLoad').callsFake(function fake(m) {
      instrumentedModules.push(m);
    });

    require.cache['/@contrast/agent/'] = {};

    const fakeLogger = testUtils.createFakeLogger();
    const tracing = require('../../src');
    const config = normalizeConfig({}, fakeLogger);
    tracing.init(config);
  });

  after(() => {
    sinon.restore();
    delete require.cache['/@contrast/agent/'];
  });

  beforeEach(() => {
    initializedTooLateHeurstic.reset();
  });

  it('hasBeenInitializedTooLate is false', () => {
    expect(initializedTooLateHeurstic.activate()).to.be.false;
  });

  it('hasBeenInitializedTooLate is false', () => {
    const p = '/Users/myuser/dev/instana/nodejs/node_modules/nope';
    require.cache[p] = {};
    expect(initializedTooLateHeurstic.activate()).to.be.false;
    delete require.cache[p];
  });

  it('hasBeenInitializedTooLate is true', () => {
    instrumentedModules.forEach(moduleName => {
      // eslint-disable-next-line no-console
      console.log(`### for module ${moduleName}`);

      initializedTooLateHeurstic.reset();

      let resolvedPath = moduleName;

      try {
        resolvedPath = require.resolve(moduleName);
      } catch (err) {
        resolvedPath = path.resolve(resolvedPath.toString().replace(/\\\/?/g, '/'));
      }

      if (!fs.existsSync(resolvedPath)) {
        // eslint-disable-next-line no-console
        console.log(`Do not expect anything if the module ${resolvedPath} is not installed.`);
        return;
      }

      require.cache[resolvedPath] = {};
      const exclude = ['bluebird', 'pino', 'winston'];
      const excluded = exclude.filter(n => resolvedPath.indexOf(n) !== -1);

      if (excluded.length) {
        expect(initializedTooLateHeurstic.activate()).to.be.false;
      } else {
        expect(initializedTooLateHeurstic.activate()).to.be.true;
      }

      delete require.cache[resolvedPath];
    });
  });
});
