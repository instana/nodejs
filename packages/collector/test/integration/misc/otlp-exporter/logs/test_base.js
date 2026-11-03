/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');

const config = require('@_local/core/test/config');
const { retry, delay } = require('@_local/core/test/test_util');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

const mochaSuiteFn = config.getTestTimeout() > 0 ? describe : describe.skip;

module.exports = function () {
  mochaSuiteFn('otlp-exporter logs', function () {
    this.timeout(config.getTestTimeout());

    let agentControls;
    let controls;

    const startApp = async (env = {}) => {
      agentControls = new AgentStubControls();
      await agentControls.startAgent();

      controls = new ProcessControls({
        dirname: __dirname,
        agentControls,
        env
      });

      await controls.startAndWaitForAgentConnection();
    };

    const findLogRecords = async () => {
      const logs = await agentControls.getLogs();
      return logs.flatMap(log => log.resourceLogs.flatMap(rl => rl.scopeLogs.flatMap(sl => sl.logRecords)));
    };

    afterEach(async () => {
      await controls.stop();
      await agentControls.stopAgent();
    });

    describe('when OTLP is enabled', () => {
      beforeEach(async () => {
        await startApp();
      });

      it('should send log spans in OTLP format to /v1/logs', async () => {
        await controls.sendRequest({ method: 'GET', path: '/warn' });
        await controls.sendRequest({ method: 'GET', path: '/error' });

        const records = await retry(async () => {
          const found = await findLogRecords();
          expect(found).to.have.lengthOf(2);
          return found;
        });

        const warn = records.find(r => r.body.stringValue === 'OTLP log test - warn message');
        expect(warn).to.exist;
        expect(warn.severityText).to.equal('warn');
        expect(warn.severityNumber).to.equal(13);

        const error = records.find(r => r.body.stringValue === 'OTLP log test - error message');
        expect(error).to.exist;
        expect(error.severityText).to.equal('error');
        expect(error.severityNumber).to.equal(17);

        records.forEach(record => {
          expect(record.traceId).to.match(/^[0-9a-f]{32}$/);
          expect(record.spanId).to.match(/^[0-9a-f]{16}$/);
          expect(record.timeUnixNano).to.match(/^\d+$/);
          expect(record.observedTimeUnixNano).to.equal(record.timeUnixNano);
        });
      });

      it('should wrap the log records in resource and scope', async () => {
        await controls.sendRequest({ method: 'GET', path: '/warn' });

        const payload = await retry(async () => {
          const logs = await agentControls.getLogs();
          expect(logs).to.have.lengthOf.at.least(1);
          return logs[0];
        });

        expect(payload.resourceLogs).to.be.an('array').with.lengthOf.at.least(1);

        const resourceLogs = payload.resourceLogs[0];
        expect(resourceLogs.resource.attributes).to.be.an('array');
        expect(resourceLogs.scopeLogs).to.be.an('array').with.lengthOf.at.least(1);

        const scope = resourceLogs.scopeLogs[0].scope;
        expect(scope.name).to.be.a('string').and.not.be.empty;
        expect(scope.version).to.be.a('string').and.not.be.empty;
      });

      it('should not send log spans as part of the OTLP traces', async () => {
        await controls.sendRequest({ method: 'GET', path: '/warn' });

        await retry(async () => {
          expect(await findLogRecords()).to.have.lengthOf(1);
          expect(await agentControls.getSpans()).to.have.lengthOf.at.least(1);
        });

        await delay(1000);
        const spans = await agentControls.getSpans();
        spans.forEach(span => expect(span.resourceSpans).to.be.an('array'));
        expect(JSON.stringify(spans)).to.not.include('OTLP log test - warn message');
      });
    });

    describe('when OTLP is disabled', () => {
      beforeEach(async () => {
        await startApp({ OTLP_DISABLED: 'true' });
      });

      it('should keep log spans in Instana format and not use /v1/logs', async () => {
        await controls.sendRequest({ method: 'GET', path: '/warn' });

        const logSpan = await retry(async () => {
          const spans = await agentControls.getSpans();
          const found = spans.find(s => s.n === 'log.console');
          expect(found).to.exist;
          return found;
        });

        expect(logSpan.data.log.message).to.equal('OTLP log test - warn message');
        expect(logSpan.data.log.level).to.equal('warn');
        expect(await agentControls.getLogs()).to.be.empty;
      });
    });
  });
};
