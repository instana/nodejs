/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const async = require('async');
const path = require('path');
const { execSync } = require('child_process');
const rimraf = require('rimraf');

const config = require('../../../core/test/config');
const { retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('../globalAgent');

const { verifyHttpRootEntry, verifyHttpExit } = require('../../../core/test/test_util/common_verifications');

// Background: Up until version 1.110.4, the package.json files defined dependency _ranges_ for internal @instana
// dependencies. That is, @instana/collector@1.110.4 would depend on "@instana/core": "^1.110.4" and
// "@instana/shared-metrics": "^1.110.4" (note the caret character "^"). This is lerna's default. Starting with
// 1.110.5, internal dependencies were switched to exact versions, that is, @instana/collector@1.110.5 depends on
// "@instana/core": "1.110.5" and "@instana/shared-metrics": "1.110.5".
//
// Some users have setups that pin @instana/collector to a certain version (1.110.4 or older, some even 1.98.1
// or older) but allow transitive dependencies (@instana/core and @instana/shared-metrics) to be updated to newer
// versions. This can lead to situtations where, let's say, @instana/collector@1.80.0 is used together with
// @instana/core@1.128.0. These setups/ will break if the API of @instana/core or other internal packages are changed in
// an incompatible way (remove a public/ method, change the signature etc.).
//
// This test makes sure this does not happen. It deliberately installs the most recent versions of core together with an
// older collector version. The version 1.98.1 is used because that was the last version before @instana/shared-metrics
// was separated out into its own package.
//
// We can get rid of this test and the backwards compat requirements once all users have upgraded to at least 1.110.5.

describe('verify backwards compatibility between old collector module and more recent core', function () {
  const timeout = Math.max(config.getTestTimeout(), 20000);
  this.timeout(timeout);

  let originalWorkingDir;

  before(done => {
    originalWorkingDir = process.cwd();
    npmPack('core');
    process.chdir(__dirname);
    execCmdSync('npm --loglevel=warn install --production --no-optional --no-package-lock');

    // You might guess that installing the tgz file for core via npm install (and the package.json referring to that
    // tgz file explicitly) is enough. Unfortunately that will actually use a _stale copy of the tgz file_ from npm's
    // cache, if available. To avoid that we, force npm to actually use the tgz files we just created by installing it
    // again, explicitly.
    execCmdSync('npm --loglevel=warn install --production --no-optional --no-save --no-package-lock instana-core.tgz');

    // Forcefully remove @instana/core that might have been installed from npm registry, so the installation from the
    // npm pack tar files is used.
    async.series([rimraf.bind(null, 'node_modules/@instana/collector/node_modules/@instana')], done);
  });

  after(done => {
    process.chdir(__dirname);
    async.series(
      [
        rimraf.bind(null, '*.tgz'),
        rimraf.bind(null, 'node_modules'),
        cb => {
          if (originalWorkingDir) {
            process.chdir(originalWorkingDir);
          }
          cb();
        }
      ],
      done
    );
  });

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    agentControls,
    useGlobalAgent: true
  }).registerTestHooks();

  it('API changes are backwards compatible', async () => {
    await controls.sendRequest({ path: '/test' });
    await retry(() =>
      agentControls.getSpans().then(spans => {
        const httpEntry = verifyHttpRootEntry({ spans, apiPath: '/test', pid: String(controls.getPid()) });
        verifyHttpExit({ spans, parent: httpEntry, pid: String(controls.getPid()) });
      })
    );
  });
});

function npmPack(packageName) {
  // eslint-disable-next-line no-console
  console.log(`@instana/${packageName}: npm pack`);
  process.chdir(path.join(__dirname, `../../../${packageName}`));
  const packedFiledName = execCmdSync('npm pack');
  execCmdSync(`mv ${packedFiledName} ../collector/test/backward_compat/instana-${packageName}.tgz`);
}

function execCmdSync(cmd) {
  // eslint-disable-next-line no-console
  console.log(`Executing: ${cmd}`);
  const output = String(execSync(cmd)).trim();
  if (output) {
    // eslint-disable-next-line no-console
    console.log(`Output of: ${cmd}: ${output}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Done: ${cmd} (no output)`);
  }
  return output;
}
