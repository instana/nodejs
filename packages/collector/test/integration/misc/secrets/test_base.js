/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const { expect } = require('chai');

const config = require('@_local/core/test/config');
const { retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');

module.exports = function (name, version) {
  const inVersionDir =
    path.basename(__dirname).startsWith('_v') || path.basename(path.dirname(__dirname)).startsWith('_v');
  const versionDir = inVersionDir ? __dirname : path.join(__dirname, `_v${version}`);

  this.timeout(config.getTestTimeout() * 2);

  describe('Secrets Configuration Precedence', () => {
    describe('when both agent config and env var are set, env var takes precedence', () => {
      const customAgentControls = new AgentStubControls();
      let controls;

      before(async () => {
        await customAgentControls.startAgent({
          secrets: {
            matcher: 'equals',
            list: ['agentToken']
          }
        });

        controls = new ProcessControls({
          agentControls: customAgentControls,
          dirname: __dirname,
          cwd: versionDir,
          env: {
            INSTANA_SECRETS: 'equals:envToken'
          }
        });
        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await customAgentControls.stopAgent();
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      it('should use env var config (equals:envToken) and ignore agent config', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/?agentToken=value1&envToken=value2&normalParam=value3'
        });

        await retry(async () => {
          const spans = await customAgentControls.getSpans();
          expect(spans.length).to.be.at.least(1);

          const httpEntry = spans.find(span => span.n === 'node.http.server');
          expect(httpEntry).to.exist;

          expect(httpEntry.data.http.params).to.equal('agentToken=value1&envToken=<redacted>&normalParam=value3');
        });
      });
    });

    describe('when only agent config is provided', () => {
      const customAgentControls = new AgentStubControls();
      let controls;

      before(async () => {
        await customAgentControls.startAgent({
          secrets: {
            matcher: 'equals',
            list: ['agentOnlyToken']
          }
        });

        controls = new ProcessControls({
          agentControls: customAgentControls,
          dirname: __dirname,
          cwd: versionDir
        });
        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await customAgentControls.stopAgent();
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      it('should use agent config', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/?agentOnlyToken=value1&otherParam=value2'
        });

        await retry(async () => {
          const spans = await customAgentControls.getSpans();
          expect(spans.length).to.be.at.least(1);

          const httpEntry = spans.find(span => span.n === 'node.http.server');
          expect(httpEntry).to.exist;

          expect(httpEntry.data.http.params).to.equal('agentOnlyToken=<redacted>&otherParam=value2');
        });
      });
    });

    describe('when in-code config is provided along with agent config', () => {
      const customAgentControls = new AgentStubControls();
      let controls;

      before(async () => {
        await customAgentControls.startAgent({
          secrets: {
            matcher: 'equals',
            list: ['agentCodeToken']
          }
        });

        controls = new ProcessControls({
          agentControls: customAgentControls,
          dirname: __dirname,
          cwd: versionDir,
          env: {
            USE_INCODE_SECRETS_CONFIG: 'true'
          }
        });
        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await customAgentControls.stopAgent();
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      it('should use in-code config and ignore agent config', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/?agentCodeToken=value1&incodeToken=value2&normalParam=value3'
        });

        await retry(async () => {
          const spans = await customAgentControls.getSpans();
          expect(spans.length).to.be.at.least(1);

          const httpEntry = spans.find(span => span.n === 'node.http.server');
          expect(httpEntry).to.exist;

          expect(httpEntry.data.http.params).to.equal(
            'agentCodeToken=value1&incodeToken=<redacted>&normalParam=value3'
          );
        });
      });
    });
  });
};
