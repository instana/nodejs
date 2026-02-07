/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const rimraf = require('rimraf');

const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { executeCallback } = require('../../../test_util/executeCommand');

const babelAppDir = path.join(__dirname, '../../../apps/babel-typescript');
const babelLibDir = path.join(babelAppDir, 'lib');
const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing a babel/typescript setup', function () {
  this.timeout(config.getTestTimeout() * 6);

  globalAgent.setUpCleanUpHooks();

  before(done => {
    rimraf(babelLibDir, err => {
      if (err) {
        return done(err);
      }
      // If this fails with "Error: Cannot find module './testUtils'" there might be left over node_modules installed by
      // a different Node.js version. rm -rf packages/collector/test/apps/babel-typescript/node_modules and run again.

      // We use --omit=optional to make npm install a bit faster. Compiling native add-ons (gcstats.js and friends)
      // might take longer than the the timeout on CI, and they are not relevant for this test suite.

      // The lock file collector/test/apps/babel-typescript/package-lock.json has some arbitrary (and probably outdated)
      // version of @_local/collector. We always update to the latest version before actually running the test.
      const latestCollectorVersion = require(path.join(__dirname, '..', '..', '..', '..', 'package.json')).version;

      executeCallback(
        `npm install --no-save --omit=optional --no-audit @_local/collector@${latestCollectorVersion} && ` +
          'npm install --omit=optional --no-audit && ' +
          'npm run build',
        babelAppDir,
        done
      );
    });
  });

  after(done => {
    rimraf(babelLibDir, done);
  });

  this.timeout(config.getTestTimeout());

  let controls;

  before(async () => {
    controls = new ProcessControls({
      appPath: path.join(__dirname, '../../../apps/babel-typescript'),
      useGlobalAgent: true,
      env: {
        INSTANA_COPY_PRECOMPILED_NATIVE_ADDONS: false
      }
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  describe('@_local/collector used in a babel-transpiled typescript app', function () {
    it('should trace when imported with workaround according to our docs', () =>
      controls
        .sendRequest({
          path: '/'
        })
        .then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.p).to.not.exist,
                span => expect(span.data.http.method).to.equal('GET'),
                span => expect(span.data.http.url).to.equal('/')
              ]);
            })
          )
        ));
  });
});
