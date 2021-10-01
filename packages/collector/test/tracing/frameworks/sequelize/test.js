/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@instana/core').tracing.constants;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, verifyHttpRootEntry, expectAtLeastOneMatching } = require('../../../../../core/test/test_util');
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

  describe('parameterized bindings', () => {
    it('select', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/param-bindings-select'
        })
        .then(() => {
          return retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);

              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/param-bindings-select',
                pid: String(controls.getPid())
              });

              verifyPgExit(
                spans,
                httpEntry,
                'SELECT "name" FROM "User" AS "User" WHERE "User"."name" = \'parapeter\' LIMIT 1;'
              );
            })
          );
        }));

    it('insert', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/param-bindings-insert'
        })
        .then(() => {
          return retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(2);

              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/param-bindings-insert',
                pid: String(controls.getPid())
              });

              verifyPgExit(
                spans,
                httpEntry,
                'INSERT INTO "User" ("name","updatedAt","createdAt") ' +
                  'VALUES ($1,$2,$3) RETURNING "id","name","createdAt","updatedAt";'
              );
            })
          );
        }));
  });

  function verifyPgExit(spans, parent, statement) {
    return expectAtLeastOneMatching(spans, span => {
      verifyPgExitBase(span, parent, statement);
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
    });
  }

  function verifyPgExitBase(span, parent, statement) {
    expect(span.n).to.equal('postgres');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.data).to.exist;
    expect(span.data.pg).to.exist;
    expect(span.data.pg.stmt).to.equal(statement);
  }
});
