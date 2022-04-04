/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
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

mochaSuiteFn('tracing/fastify', function () {
  this.timeout(config.getTestTimeout());

  ['1.14.6', '2.15.3', '3.21.5'].forEach(version => {
    describe(`${version}`, () => {
      const agentControls = globalAgent.instance;
      let processControls;

      describe('path templates', () => {
        globalAgent.setUpCleanUpHooks();

        processControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          useGlobalAgent: true,
          env: {
            FASTIFY_VERSION: version
          }
        });

        ProcessControls.setUpHooks(processControls);

        check('/', 200, { hello: 'world' }, '/');
        check('/hooks', 200, { hello: 'world' }, '/hooks');
        check('/hooks-early-reply', 200, { hello: 'world' }, '/hooks-early-reply');
        check('/route', 200, { hello: 'world' }, '/route');
        check('/foo/42', 200, { hello: 'world' }, '/foo/:id');
        check('/before-handler/13', 200, { before: 'handler' }, '/before-handler/:id');
        check(
          '/before-handler-array/02',
          500,
          { statusCode: 500, error: 'Internal Server Error', message: 'Yikes' },
          '/before-handler-array/:id'
        );
        check('/sub', 200, { hello: 'world' }, '/sub');
        check('/sub/bar/42', 200, { hello: 'world' }, '/sub/bar/:id');
      });

      function check(actualPath, expectedStatusCode, expectedResponse, expectedTemplate) {
        it(`must report path templates for actual path: ${actualPath}`, () =>
          processControls
            .sendRequest({
              method: 'GET',
              path: actualPath,
              simple: false,
              resolveWithFullResponse: true
            })
            .then(response => {
              expect(response.statusCode).to.equal(expectedStatusCode);
              expect(response.body).to.deep.equal(expectedResponse);
              return testUtils.retry(() =>
                agentControls.getSpans().then(spans => {
                  testUtils.expectAtLeastOneMatching(spans, [
                    span => expect(span.data.http.path_tpl).to.equal(expectedTemplate),
                    span => expect(span.data.http.status).to.equal(expectedStatusCode),
                    span => expect(span.data.http.url).to.equal(actualPath),
                    span => expect(span.k).to.equal(constants.ENTRY)
                  ]);
                })
              );
            }));
      }
    });
  });
});
