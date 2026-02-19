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
const config = require('@_local/core/test/config');
const { retry, verifyHttpRootEntry, verifyExitSpan } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { executeAsync } = require('@_local/collector/test/test_util/executeCommand');

const appDir = __dirname;
const schemaTargetFile = path.join(appDir, 'prisma', 'schema.prisma');
const migrationsTargetDir = path.join(appDir, 'prisma', 'migrations');

module.exports = function (name, version, isLatest, mode) {
  this.timeout(Math.max(config.getTestTimeout() * 3, 20000));

  const provider = mode; // mode is either 'sqlite' or 'postgresql'
  const majorVersion = parseInt(version, 10);
  const isV7 = majorVersion >= 7;
  // Getting the URL is not possible between Prisma 4.10 and 5.1 (getConfig was removed)
  const urlUnavailable = semver.gte(version, '4.10.0') && semver.lt(version, '5.2.0');

  if (provider === 'postgresql' && !process.env.INSTANA_CONNECT_POSTGRES_PRISMA_URL) {
    throw new Error('PRISMA_POSTGRES_URL is not set.');
  }

  // Legacy prisma schemas (< v7) read the URL via env("PRISMA_POSTGRES_URL")
  if (provider === 'postgresql' && !isV7) {
    process.env.PRISMA_POSTGRES_URL = process.env.INSTANA_CONNECT_POSTGRES_PRISMA_URL;
  }

  before(async () => {
    await executeAsync('rm -rf node_modules', appDir);
    await executeAsync('mkdir -p node_modules', appDir);

    const versionToInstall = version;

    try {
      await executeAsync(`npm install prisma@${versionToInstall}`, appDir);
    } catch (err) {
      // ignore
    }

    try {
      await executeAsync(`npm i @prisma/client@${versionToInstall}`, appDir);
    } catch (err) {
      // ignore
    }

    // Install db adapters for Prisma v7+
    // https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
    if (isV7) {
      const adapter =
        provider === 'postgresql'
          ? `@prisma/adapter-pg@${versionToInstall}`
          : `@prisma/adapter-better-sqlite3@${versionToInstall}`;

      try {
        await executeAsync(`npm i ${adapter}`, appDir);
      } catch {
        // ignore errors
      }
    }
  });

  // Set up Prisma stuff for the provider we want to test with (either sqlite or postgresql).
  before(async () => {
    // Starting with v7, the migrations no longer reads the url directly from the schema.
    // Instead, it expects the url to be defined in prisma.config files
    const schemaSuffix = !isV7 ? `${provider}.legacy` : provider;
    const schemaSourceFile = path.join(appDir, 'prisma', `schema.prisma.${schemaSuffix}`);

    await fs.rm(schemaTargetFile, { force: true });
    await fs.copyFile(schemaSourceFile, schemaTargetFile);

    const migrationsSourceDir = path.join(appDir, 'prisma', `migrations-${provider}`);
    await rimraf(migrationsTargetDir);
    await recursiveCopy(migrationsSourceDir, migrationsTargetDir);

    // Run the prisma client tooling to generate the database client access code.
    // See https://www.prisma.io/docs/reference/api-reference/command-reference#generate
    const prismaConfig = isV7 ? `--config prisma-${provider}.config.js` : '';
    await executeAsync(`npx prisma generate ${prismaConfig}`, appDir);

    // Run database migrations to create the table
    await executeAsync(`npx prisma migrate reset --force ${prismaConfig}`, appDir);
  });

  after(async () => {
    await fs.rm(schemaTargetFile, { force: true });
    await rimraf(migrationsTargetDir);
  });

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  before(async () => {
    const env = {
      LIBRARY_VERSION: version,
      LIBRARY_NAME: name,
      LIBRARY_LATEST: isV7,
      PROVIDER: provider
    };

    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env
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
          spans,
          parent: httpEntry,
          model: 'Person',
          action: withError ? 'findFirst' : 'findMany',
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
        spans,
        parent: httpEntry,
        model: 'Person',
        action: 'create'
      });
      verifyPrismaExit({
        spans,
        parent: httpEntry,
        model: 'Person',
        action: 'update'
      });
      verifyPrismaExit({
        spans,
        parent: httpEntry,
        model: 'Person',
        action: 'deleteMany'
      });
    });
  });

  function verifyReadResponse(response, withError) {
    if (withError) {
      if (majorVersion >= 5) {
        expect(response).to.include('PrismaClientValidationError');
      } else {
        expect(response).to.include('Unknown arg `email` in where.email');
      }
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

  function verifyPrismaExit({ spans, parent, model, action, withError }) {
    let expectedUrl;
    switch (provider) {
      case 'sqlite':
        expectedUrl = 'file:./dev.db';
        break;
      case 'postgresql':
        expectedUrl = process.env.INSTANA_CONNECT_POSTGRES_PRISMA_URL.replace('nodepw', '_redacted_');
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
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
        span =>
          // URL is unavailable between Prisma 4.10 and 5.1 (getConfig removed)
          // In v7, SQLite adapter doesn't expose the URL
          !(urlUnavailable || (provider === 'sqlite' && isV7))
            ? expect(span.data.prisma.url).to.equal(expectedUrl)
            : expect(span.data.prisma.url).to.equal(''),
        span => {
          if (provider !== 'sqlite' && !urlUnavailable) {
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
};
