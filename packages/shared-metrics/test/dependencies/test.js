/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable no-console */

'use strict';

const _ = require('lodash');
const expect = require('chai').expect;
const { execSync } = require('child_process');
const { mkdtempSync, symlinkSync, unlinkSync } = require('fs');
const mkdirp = require('mkdirp');
const recursiveCopy = require('recursive-copy');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');
const semver = require('semver');

const config = require('../../../core/test/config');
const { retry } = require('../../../core/test/test_util');
const ProcessControls = require('../../../collector/test/test_util/ProcessControls');
const globalAgent = require('../../../collector/test/globalAgent');

describe('dependencies', function () {
  this.timeout(Math.max(config.getTestTimeout() * 2, 20000));

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('with a package.json file', () => {
    const appDir = path.join(__dirname, 'app-with-package-json');
    before(() => {
      runCommand('npm install --no-audit', appDir);
    });

    const controls = new ProcessControls({
      dirname: appDir,
      useGlobalAgent: true,
      port: 7215,
      env: {
        INSTANA_AGENT_PORT: 7211
      }
    }).registerTestHooks();

    it('should limit dependencies when there is a package.json file', () =>
      retry(() =>
        agentControls.getAllMetrics(controls.getPid()).then(allMetrics => {
          const deps = findMetric(allMetrics, ['dependencies']);
          expect(deps).to.be.an('object');
          expect(Object.keys(deps)).to.have.lengthOf(75);

          expectVersion(deps.fastify, '^3.20.2');
          expectVersion(deps.express, '^4.17.1');
          expectVersion(deps.koa, '^2.13.1');

          expect(deps.mime).to.exist;
          expect(deps.negotiator).to.exist;
          expect(deps['mime-types']).to.exist;
          expect(deps.negotiator).to.exist;

          // According to how we sort and limit the collected dependencies, negotiator should be the last package that
          // is included while pino-std-serializers is the first that is omitted.

          expect(deps['pino-std-serializers']).to.not.exist;
          expect(deps['quick-format-unescaped']).to.not.exist;
          expect(deps['raw-body']).to.not.exist;
          expect(deps['readable-stream']).to.not.exist;
        })
      ));
  });

  describe('without a package.json file', () => {
    // This simulates a deployment where the package.json file is not included in the deployment. It is not entirely
    // trivial to create that situation. We copy the app from ./app-without-package-json to a temporary directory, then
    // run npm install there and finally delete the package.json file.
    // Even if we had an app without a package.json file right here in the packages/shared-metrics/test folder, our
    // lookup mechanism would find another package.json file in packages/shared-metrics, or, if that would be missing,
    // in the root directory of the repository. This is because the lookup mechanism traverses the file system hierarchy
    // upwards.

    const appDir = path.join(__dirname, 'app-without-package-json');
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), '@instana-shared-metrics-test'));
    const repoRootDir = path.join(__dirname, '..', '..', '..', '..');

    before(async () => {
      console.log(`Copying test app from ${appDir} to ${tmpDir}.`);
      await recursiveCopy(appDir, tmpDir);
      runCommand('npm install --no-audit', tmpDir);
      const instanaPath = path.join(tmpDir, 'node_modules', '@instana');
      mkdirp.sync(instanaPath);
      const collectorPath = path.join(instanaPath, 'collector');
      // We create a symlink to this repo for the @instana/collector package to be able to test with the current code
      // base. A downside of this is that also the dev dependencies of @instana/collector and friends will be found.
      symlinkSync(path.join(repoRootDir, 'packages', 'collector'), collectorPath);
      unlinkSync(path.join(tmpDir, 'package.json'));
    });

    const controls = new ProcessControls({
      dirname: tmpDir,
      useGlobalAgent: true,
      port: 7215,
      env: {
        INSTANA_AGENT_PORT: 7211,
        INSTANA_NODES_REPO: repoRootDir
      }
    }).registerTestHooks();

    after(done => {
      rimraf(tmpDir, done);
    });

    it('should limit dependencies when there is no package.json file', () =>
      retry(() =>
        agentControls.getAllMetrics(controls.getPid()).then(allMetrics => {
          const deps = findMetric(allMetrics, ['dependencies']);
          expect(deps).to.be.an('object');
          expect(Object.keys(deps)).to.have.lengthOf(300);

          expect(deps['@instana/shared-metrics']).to.exist;
          expect(deps['@instana/core']).to.exist;
          expect(deps['@instana/collector']).to.exist;
          expect(deps['@instana/autoprofile']).to.exist;

          expectVersion(deps.fastify, '^3.20.2');
          expectVersion(deps.express, '^4.17.1');
          expectVersion(deps.koa, '^2.13.1');
        })
      ));
  });

  describe('for an app installed into node_modules', () => {
    // This simulates a deployment where the application is brought to the production system by installing it via npm
    // (usually a private npm registry).
    const appTgz = path.join(__dirname, 'npm-installed-app', 'npm-installed-test-app-1.0.0.tgz');
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), '@instana-shared-metrics-test'));
    const repoRootDir = path.join(__dirname, '..', '..', '..', '..');

    before(async () => {
      runCommand(`npm install --no-audit ${appTgz}`, tmpDir);
      const instanaPath = path.join(tmpDir, 'node_modules', '@instana');
      mkdirp.sync(instanaPath);
      const collectorPath = path.join(instanaPath, 'collector');
      // We create a symlink to this repo for the @instana/collector package to be able to test with the current code
      // base. A downside of this is that also the dev dependencies of @instana/collector and friends will be found.
      symlinkSync(path.join(repoRootDir, 'packages', 'collector'), collectorPath);
    });

    const controls = new ProcessControls({
      dirname: path.join(tmpDir, 'node_modules', 'npm-installed-test-app'),
      useGlobalAgent: true,
      port: 7215,
      env: {
        INSTANA_AGENT_PORT: 7211,
        INSTANA_NODES_REPO: repoRootDir
      }
    }).registerTestHooks();

    after(done => {
      rimraf(tmpDir, done);
    });

    it('should limit dependencies when the application is installed into node_modules', () =>
      retry(() =>
        agentControls.getAllMetrics(controls.getPid()).then(allMetrics => {
          const deps = findMetric(allMetrics, ['dependencies']);
          expect(deps).to.be.an('object');
          expect(Object.keys(deps)).to.have.lengthOf(300);

          expect(deps['@instana/shared-metrics']).to.exist;
          expect(deps['@instana/core']).to.exist;
          expect(deps['@instana/collector']).to.exist;
          expect(deps['@instana/autoprofile']).to.exist;

          expectVersion(deps.fastify, '^3.20.2');
          expectVersion(deps.express, '^4.17.1');
          expectVersion(deps.koa, '^2.13.1');

          // number-is-nan is one of the most distant deps (10 levels deep), but with the limit used in this test, it
          // should be included.
          expectVersion(deps['number-is-nan'], '^1.0.1');

          // eslint is a dev dependency (see above why it is included at all), but it should also be included with the
          // limit of 300 that we apply.
          expectVersion(deps.eslint, '^7.30.0');

          // growl is in the dependencies but it is past the point that is imposed by the limit so it should not be in
          // the collected dependencies.
          expect(deps.growls).to.not.exist;
        })
      ));
  });
});

/**
 * Find a particular metric in all collected metrics.
 *
 * @param {Object[]} allMetrics All collected metrics
 * @param {string[]} _path The path to the metric in question
 */
function findMetric(allMetrics, _path) {
  for (let i = allMetrics.length - 1; i >= 0; i--) {
    const value = _.get(allMetrics[i], ['data'].concat(_path));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function expectVersion(actualVersion, expectedRange) {
  expect(
    semver.satisfies(actualVersion, expectedRange),
    `${actualVersion} does not satisfy the expected range ${expectedRange}.`
  ).to.be.true;
}

/**
 * Run a shell command synchronously in a given directory.
 *
 * @param {string} cmd The command to run
 * @param {string} cwd The working directory for running the program
 */
function runCommand(cmd, cwd) {
  console.log(`Running ${cmd} in ${cwd}.`);
  const cmdOutput = execSync(cmd, { cwd });
  console.log(`Done with running ${cmd} in ${cwd}:\n${cmdOutput}`);
}
