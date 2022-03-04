/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/tsoa', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  const controls = new ProcessControls({
    appPath: path.join(__dirname, 'build/src/server'),
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  describe('path template', function () {
    it('exists if GET request', () => {
      const requestOptions = {
        method: 'GET',
        path: '/api/users/1'
      };

      return controls.sendRequest(requestOptions).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.status).to.equal(200),
              span => expect(span.data.http.path_tpl).to.equal('/api/users/:userId')
            ]);
          })
        )
      );
    });

    it('exists if POST request', () => {
      const requestOptions = {
        method: 'POST',
        path: '/api/users',
        body: {
          email: 'test@instana.test',
          name: 'Test 1',
          phoneNumbers: []
        }
      };

      return controls.sendRequest(requestOptions).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.status).to.equal(201),
              span => expect(span.data.http.path_tpl).to.equal('/api/users')
            ]);
          })
        )
      );
    });

    it('exists although there was a validation error', () => {
      const requestOptions = {
        method: 'POST',
        path: '/api/users',
        body: {
          email: 'test@instana.test'
        }
      };

      return controls
        .sendRequest(requestOptions)
        .catch(() => Promise.resolve())
        .then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.data.http.status).to.equal(400),
                span => expect(span.data.http.path_tpl).to.equal('/api/users')
              ]);
            })
          )
        );
    });

    it('exists although there was an auth error', () => {
      const requestOptions = {
        method: 'GET',
        path: '/api/users/auth-error'
      };

      return controls
        .sendRequest(requestOptions)
        .catch(() => Promise.resolve())
        .then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.data.http.status).to.equal(401),
                span => expect(span.data.http.path_tpl).to.equal('/api/users/auth-error')
              ]);
            })
          )
        );
    });

    it('does not exist if request is exited too early', () => {
      const requestOptions = {
        method: 'POST',
        path: '/api/users/error/22',
        body: {
          email: 'test@instana.test',
          name: 'Test 1',
          phoneNumbers: []
        }
      };

      return controls
        .sendRequest(requestOptions)
        .catch(() => Promise.resolve())
        .then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.data.http.path_tpl).to.not.exist,
                span => expect(span.data.http.status).to.equal(200)
              ]);
            })
          )
        );
    });
  });
});
