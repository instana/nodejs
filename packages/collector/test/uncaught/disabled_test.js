/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const path = require('path');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const Promise = require('bluebird');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const globalAgent = require('../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('uncaught exception reporting disabled', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'apps', 'server'),
    dontKillInAfterHook: true,
    useGlobalAgent: true
  }).registerTestHooks();

  it('will not finish the current span', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
      })
      .catch(err => {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');

        return Promise.delay(1000).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0);
            })
          )
        );
      }));

  it('must not report the uncaught exception as an issue', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
      })
      .catch(err => {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');
        return Promise.delay(1000).then(() =>
          testUtils.retry(() =>
            agentControls.getEvents().then(events => {
              expect(events).to.have.lengthOf(0);
            })
          )
        );
      }));
});
