/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@instana/core').tracing.constants;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  retry,
  verifyHttpRootEntry,
  expectAtLeastOneMatching,
  verifyExitSpan
} = require('../../../../../core/test/test_util');
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
        path: '/typeorm-select'
      })
      .then(() => {
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpRootEntry({
              spans,
              apiPath: '/typeorm-select',
              pid: String(controls.getPid())
            });

            verifyPgExit(
              spans,
              httpEntry,
              'SELECT "UserTypeOrm"."id" AS "UserTypeOrm_id", "UserTypeOrm"."firstName" AS "UserTypeOrm_firstName" FROM "user_type_orm" "UserTypeOrm" WHERE "UserTypeOrm"."id" = $1 LIMIT 1'
            );

            // TODO: ?
            // verifyExitSpan(spans, httpEntry);
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
