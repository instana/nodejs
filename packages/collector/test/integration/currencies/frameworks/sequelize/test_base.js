/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const expect = require('chai').expect;

const { retry, verifyHttpRootEntry, verifyExitSpan } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        LIBRARY_LATEST: isLatest,
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name
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

  describe('parameterized queries', () => {
    it('select', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/find-one'
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);

              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/find-one',
                pid: String(controls.getPid())
              });

              /**
               * https://github.com/sequelize/sequelize/pull/9431
               * Sequilize does not support parameterized queries yet
               * Exceptions: inserts and raw queries
               */
              const query = 'SELECT "name" FROM "User" AS "User" WHERE "User"."name" = \'parapeter\' LIMIT 1;';
              verifyExitSpan({
                spanName: 'postgres',
                spans,
                parent: httpEntry,
                withError: false,
                pid: String(controls.getPid()),
                dataProperty: 'pg',
                extraTests: [
                  span => {
                    expect(span.data.pg.stmt).to.equal(query);
                  }
                ]
              });
            })
          )
        ));

    it('raw', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/raw'
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);

              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/raw',
                pid: String(controls.getPid())
              });

              /**
               * https://sequelize.org/master/manual/raw-queries.html#bind-parameter
               */
              const query = 'SELECT "name" FROM "User" AS "User" WHERE "User"."name" = $1 LIMIT 1;';
              verifyExitSpan({
                spanName: 'postgres',
                spans,
                parent: httpEntry,
                withError: false,
                pid: String(controls.getPid()),
                dataProperty: 'pg',
                extraTests: [
                  span => {
                    expect(span.data.pg.stmt).to.equal(query);
                  }
                ]
              });
            })
          )
        ));

    it('insert', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/insert'
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);

              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/insert',
                pid: String(controls.getPid())
              });

              const query =
                'INSERT INTO "User" ("name","updatedAt","createdAt") ' +
                'VALUES ($1,$2,$3) RETURNING "id","name","createdAt","updatedAt";';

              verifyExitSpan({
                spanName: 'postgres',
                spans,
                parent: httpEntry,
                withError: false,
                pid: String(controls.getPid()),
                dataProperty: 'pg',
                extraTests: [
                  span => {
                    expect(span.data.pg.stmt).to.equal(query);
                  }
                ]
              });
            })
          )
        ));
  });
};
