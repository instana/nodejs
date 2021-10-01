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

mochaSuiteFn('frameworks/typeorm', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  it('parameterized bindings', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/param-bindings'
      })
      .then(() => {
        return retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.equal(2);

            const httpEntry = verifyHttpRootEntry({
              spans,
              apiPath: '/param-bindings',
              pid: String(controls.getPid())
            });

            verifyPgExit(
              spans,
              httpEntry,
              'SELECT "UserTypeOrm"."id" AS "UserTypeOrm_id", "UserTypeOrm"."name" ' +
                'AS "UserTypeOrm_name" FROM "user_type_orm" "UserTypeOrm" WHERE ' +
                '"UserTypeOrm"."name" = $1 LIMIT 1'
            );
          })
        );
      }));

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
