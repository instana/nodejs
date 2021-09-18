/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const Control = require('../Control');

// NOTE: This test will fail if you initialise core before serverless.
//       e.g. aws-lambda/src/index -> require core and call init
describe('Logging', function () {
  this.timeout(5000);
  let control;

  before(() => {
    const backendPort = 8443;
    const backendBaseUrl = `https://localhost:${backendPort}/serverless`;
    const instanaAgentKey = 'aws-lambda-dummy-key';
    const downstreamDummyPort = 3456;
    const downstreamDummyUrl = `http://localhost:${downstreamDummyPort}/`;

    control = new Control({
      handlerDefinitionPath: path.join(__dirname, './lambda'),
      faasRuntimePath: path.join(__dirname, '../runtime_mock'),
      startBackend: true,
      downstreamDummyUrl,
      backendPort,
      backendBaseUrl,
      env: {
        INSTANA_ENDPOINT_URL: backendBaseUrl,
        INSTANA_AGENT_KEY: instanaAgentKey
      }
    });

    control.registerTestHooks();
  });

  it('does not capture serverless console logger usages', async () => {
    await control.runHandler();
    const spans = await control.getSpans();

    expect(spans.length).to.eql(3);

    expect(spans[0].n).to.eql('log.console');
    expect(spans[0].data.log.message).to.eql('this is a warning');

    expect(spans[1].n).to.eql('log.console');
    expect(spans[1].data.log.message).to.eql('this is an error');

    expect(spans[2].n).to.eql('aws.lambda.entry');
  });
});
