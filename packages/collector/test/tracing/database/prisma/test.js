/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs').promises;
const path = require('path');
const recursiveCopy = require('recursive-copy');
const rimraf = require('util').promisify(require('rimraf'));
const semver = require('semver');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, verifyHttpRootEntry, verifyExitSpan } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { executeAsync } = require('../../../test_util/executeCommand');

const providers = ['sqlite', 'postgresql'];

const appDir = __dirname;
const schemaTargetFile = path.join(appDir, 'prisma', 'schema.prisma');
const migrationsTargetDir = path.join(appDir, 'prisma', 'migrations');

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '16.0.0') ? describe : describe.skip;

mochaSuiteFn('tracing/prisma', function () {
  this.timeout(Math.max(config.getTestTimeout() * 3, 20000));

  before(async () => {
    // We need to run npm install for the prisma application and install @prisma/client locally, because we need the
    // prisma client tooling to be installed locally. We need to run `prisma generate` and `prisma migrate deploy` (via
    // the npm scripts defined in the local package.json file) for each provider -- see the `before` hook for each
    // provider below. Prisma is somewhat finicky with paths and makes specific assumptions: Basically it expects
    // `prisma/schema.prisma` to exist in the project's root directory and the `prisma` and `@prisma/client` modules to
    // be installed into node_modules relative to that file. This is why we do not install `@prisma/client` in our
    // root dependencies, as we do for other modules under test.
    // See also: https://www.prisma.io/docs/reference/api-reference/command-reference#generate
    await executeAsync('npm install --no-audit', appDir);
  });

  providers.forEach(provider => {
    describe(`with provider ${provider}`, () => {
      if (provider === 'postgresql' && !process.env.PRISMA_POSTGRES_URL) {
        throw new Error('PRISMA_POSTGRES_URL is not set.');
      }

      // Set up Prisma stuff for the provider we want to test with (either sqlite or postgresql).
      before(async () => {
        const schemaSourceFile = path.join(appDir, 'prisma', `schema.prisma.${provider}`);

        await fs.rm(schemaTargetFile, { force: true });
        await fs.copyFile(schemaSourceFile, schemaTargetFile);

        const migrationsSourceDir = path.join(appDir, 'prisma', `migrations-${provider}`);
        await rimraf(migrationsTargetDir);
        await recursiveCopy(migrationsSourceDir, migrationsTargetDir);

        // Run the prisma client tooling to generate the database client access code.
        // See https://www.prisma.io/docs/reference/api-reference/command-reference#generate
        await executeAsync('npm run generate', appDir);

        // Run database migrations to create the table.
        await executeAsync('npm run migrate', appDir);
      });

      after(async () => {
        await fs.rm(schemaTargetFile, { force: true });
        await rimraf(migrationsTargetDir);
      });

      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true
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

      [false, true].forEach(withError => {
        it(`should capture a prisma model read action (with error: ${withError})`, async () => {
          let requestPath = '/findMany';
          if (withError) {
            requestPath += '?error=true';
          }
          const response = await controls.sendRequest({
            method: 'GET',
            path: requestPath
          });

          verifyReadResponse(response, withError);

          await retry(async () => {
            const spans = await agentControls.getSpans();
            const httpEntry = verifyHttpRootEntry({
              spans,
              apiPath: '/findMany',
              pid: String(controls.getPid())
            });
            verifyPrismaExit({
              controls,
              spans,
              parent: httpEntry,
              model: 'Person',
              action: withError ? 'findFirst' : 'findMany',
              provider,
              withError
            });
          });
        });
      });

      it('should capture a prisma write', async () => {
        const response = await controls.sendRequest({
          method: 'POST',
          path: '/update'
        });

        verifyWriteResponse(response);

        await retry(async () => {
          const spans = await agentControls.getSpans();
          const httpEntry = verifyHttpRootEntry({
            spans,
            apiPath: '/update',
            pid: String(controls.getPid())
          });
          verifyPrismaExit({
            controls,
            spans,
            parent: httpEntry,
            model: 'Person',
            action: 'create',
            provider
          });
          verifyPrismaExit({
            controls,
            spans,
            parent: httpEntry,
            model: 'Person',
            action: 'update',
            provider
          });
          verifyPrismaExit({
            controls,
            spans,
            parent: httpEntry,
            model: 'Person',
            action: 'deleteMany',
            provider
          });
        });
      });
    });
  });

  function verifyReadResponse(response, withError) {
    if (withError) {
      expect(response).to.include('PrismaClientValidationError');
    } else {
      expect(response).to.be.an('array');
      expect(response).to.have.length(1);
      const smurf = response[0];
      expect(smurf.name).to.equal('Brainy Smurf');
    }
  }

  function verifyWriteResponse({ createResult, updateResult, deleteResult }) {
    expect(createResult.id).to.be.an('number');
    expect(createResult.name).to.equal('Smurvette');
    expect(updateResult.id).to.equal(createResult.id);
    expect(updateResult.name).to.equal('Smurfette');
    expect(deleteResult.count).to.equal(1);
  }

  function verifyPrismaExit({ controls, spans, parent, model, action, provider, withError }) {
    let expectedUrl;
    switch (provider) {
      case 'sqlite':
        expectedUrl = 'file:./dev.db';
        break;
      case 'postgresql':
        expectedUrl = process.env.PRISMA_POSTGRES_URL.replace('nodepw', '_redacted_');
        break;
      default:
        throw new Error(`Unknown provider: ${expectedUrl}`);
    }
    return verifyExitSpan({
      spans,
      spanName: 'prisma',
      parent,
      withError,
      pid: String(controls.getPid()),
      extraTests: [
        span => expect(span.data.prisma.model).to.equal(model),
        span => expect(span.data.prisma.action).to.equal(action),
        span => expect(span.data.prisma.url).to.equal(expectedUrl),
        span => {
          if (provider !== 'sqlite') {
            expect(span.data.prisma.url).to.contain('_redacted_');
          }
        },
        span => expect(span.data.prisma.provider).to.equal(provider),
        span =>
          withError
            ? expect(span.data.prisma.error).to.match(/Invalid `prisma.person.findFirst\(\)` invocation/)
            : expect(span.data.prisma.error).to.not.exist
      ]
    });
  }
});
