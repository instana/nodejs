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

mochaSuiteFn('frameworks/typeorm', function () {
  this.timeout(config.getTestTimeout());

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

  it('parameterized queries', () =>
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

            const query =
              'SELECT "UserTypeOrm"."id" AS "UserTypeOrm_id", "UserTypeOrm"."name" AS "UserTypeOrm_name" ' +
              'FROM "user_type_orm" "UserTypeOrm" WHERE ("UserTypeOrm"."name" = $1) LIMIT 1';

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
