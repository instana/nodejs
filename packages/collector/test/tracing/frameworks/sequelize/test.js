/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, verifyHttpRootEntry, verifyExitSpan } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('frameworks/sequilize', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  describe('parameterized queries', () => {
    it('select', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/find-one'
        })
        .then(() => {
          return retry(() =>
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
          );
        }));

    it('insert', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/insert'
        })
        .then(() => {
          return retry(() =>
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
          );
        }));
  });
});
