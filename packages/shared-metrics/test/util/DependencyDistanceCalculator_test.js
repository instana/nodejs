/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');

const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const depDistCalculator = require('../../src/util/DependencyDistanceCalculator');
const { DependencyDistanceCalculator, __moduleRefExportedForTest: dependencyDistanceCalculatorModule } =
  depDistCalculator;

describe('dependency distance calculation', function () {
  this.timeout(config.getTestTimeout());

  // @ts-ignore
  const modulePathsOriginal = dependencyDistanceCalculatorModule.paths;
  const maxDepthOriginal = depDistCalculator.MAX_DEPTH;

  before(() => {
    depDistCalculator.init({ logger: testUtils.createFakeLogger() });
  });

  afterEach(() => {
    // @ts-ignore
    dependencyDistanceCalculatorModule.paths = modulePathsOriginal;
    depDistCalculator.MAX_DEPTH = maxDepthOriginal;
  });

  it('should not fail when dependency cannot be found', done => {
    runTest('01', distances => {
      expect(Object.keys(distances)).to.have.lengthOf(1);
      expect(distances['does-not-exist']).to.equal(1);
      done();
    });
  });

  it('should calculate distances for dependencies', done => {
    // Given a flat node modules, with inter-package dependencies looking like this:
    //
    // dependencies_test_dir_02
    // |- bar
    // |- foo
    // |  |-foo-peer (peer dependency)
    // |  |-bar (peer dependency, duplicated)
    // |- opt-dep (optional dependency)
    // |- peer-dep-1 (peer dependency)
    //    |- peer-opt (optional dependency)
    //      |- foo (duplicated)
    // |- peer-dep-2 (peer dependency)
    // |- will-be-ignored-1 (dev dependency)
    // |- will-be-ignored-2 (dev dependency)

    runTest('02', distances => {
      expect(Object.keys(distances)).to.have.lengthOf(7);

      expect(distances.bar).to.equal(1);
      expect(distances.foo).to.equal(1);
      expect(distances['foo-peer']).to.equal(2);
      expect(distances['opt-dep']).to.equal(1);
      expect(distances['peer-dep-1']).to.equal(1);
      expect(distances['peer-opt']).to.equal(2);
      expect(distances['peer-dep-2']).to.equal(1);

      // We ignore dev dependencies on purpose. Usually, they should not be installed in the first place. If they are,
      // we are fine with them getting assigned to dependency distance max-depth + 1.
      expect(distances['will-be-ignored-1']).to.not.exist;
      expect(distances['will-be-ignored-2']).to.not.exist;

      done();
    });
  });

  it('should calculate distances for larger tree', done => {
    // Given a flat node modules, with inter-package dependencies looking like this:
    //
    // dependencies_test_dir_03
    // |- a
    // |  |-aa
    // |  |-ab
    // |  | |-aba
    // |  | |-abb
    // |  |-ac
    // |- b
    // |  |-ba
    // |  |-bb
    // |  |-bc
    // |    |-bca
    // |    |-bcb
    // |    | |-bcba
    // |    |   |-bcbaa
    // |    |     |-bcbaaa
    // |    |       |-bcbaaaa
    // |    |         |-bcbaaaaa
    // |    |           |-bcbaaaaaa
    // |    |             |-bcbaaaaaaa
    // |    |               |-bcbaaaaaaaa
    // |    |                 |-bcbaaaaaaaaa
    // |    |-bcc
    // |- c
    //    |- ca
    //    |- cb

    depDistCalculator.MAX_DEPTH = 10;
    runTest('03', distances => {
      expect(Object.keys(distances)).to.have.lengthOf(23);
      expect(distances.a).to.equal(1);
      expect(distances.aa).to.equal(2);
      expect(distances.ab).to.equal(2);
      expect(distances.aba).to.equal(3);
      expect(distances.abb).to.equal(3);
      expect(distances.ac).to.equal(2);
      expect(distances.b).to.equal(1);
      expect(distances.ba).to.equal(2);
      expect(distances.bb).to.equal(2);
      expect(distances.bc).to.equal(2);
      expect(distances.bca).to.equal(3);
      expect(distances.bcb).to.equal(3);
      expect(distances.bcba).to.equal(4);
      expect(distances.bcbaa).to.equal(5);
      expect(distances.bcbaaa).to.equal(6);
      expect(distances.bcbaaaa).to.equal(7);
      expect(distances.bcbaaaaa).to.equal(8);
      expect(distances.bcbaaaaaa).to.equal(9);
      expect(distances.bcbaaaaaaa).to.equal(10);
      expect(distances.bcc).to.equal(3);
      expect(distances.c).to.equal(1);
      expect(distances.ca).to.equal(2);
      expect(distances.cb).to.equal(2);

      // The following two exist in the dependency tree but they will not be captured due to the max-depth limit of 10.
      expect(distances.bcbaaaaaaaa).to.not.exist;
      expect(distances.bcbaaaaaaaaa).to.not.exist;

      done();
    });
  });
});

/**
 * @param {string} dirIdx
 * @param {(distances: Object<string, number>) => void} callback
 */
function runTest(dirIdx, callback) {
  const basePath = path.join(__dirname, `dependencies_test_dir_${dirIdx}`);
  const packageJsonPath = path.join(basePath, 'package.json');
  const nodeModulesPath = path.join(basePath, 'node_modules');
  // @ts-ignore
  dependencyDistanceCalculatorModule.paths.push(nodeModulesPath);
  new DependencyDistanceCalculator().calculateDistancesFrom(packageJsonPath, callback);
}
