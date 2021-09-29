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

mochaSuiteFn('frameworks/bookshelf', function () {
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
          path: '/bookshelf-select'
        })
        .then(() => {
          return retry(() =>
            agentControls.getSpans().then(spans => {
              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/sequelize-select',
                pid: String(controls.getPid())
              });

              verifyPgExit(spans, httpEntry, 'select "users".* from "users" where "users"."id" = $1 limit $2');

              // TODO: ?
              // verifyExitSpan(spans, httpEntry);
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
