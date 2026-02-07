/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

['latest', 'v2'].forEach(version => {
  mochaSuiteFn(`tracing/graphql-subscriptions@${version} - PubSub/async iterator (pull before push)`, function () {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        env: {
          GRAPHQL_SUBSCRIPTIONS_VERSION: version
        },
        useGlobalAgent: true
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await globalAgent.instance.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });

    it('should keep cls context when pulling before pushing', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/pull-before-push'
        })
        .then(valuesReadFromCls => {
          expect(valuesReadFromCls).to.have.lengthOf(3);
          expect(valuesReadFromCls[0]).to.equal('test-value');
          expect(valuesReadFromCls[1]).to.equal('test-value');
          expect(valuesReadFromCls[2]).to.equal('test-value');
        }));
  });
});
