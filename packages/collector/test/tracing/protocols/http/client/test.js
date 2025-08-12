/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { expectExactlyOneMatching, retry, delay } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/http client', function () {
  this.timeout(config.getTestTimeout() * 2);

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  describe('http', function () {
    registerTests.call(this, false);
  });

  describe('https', function () {
    registerTests.call(this, true);
  });

  registerConnectionRefusalTest.call(this, false);
  registerConnectionRefusalTest.call(this, true);

  const runSuperagent = supportedVersion(process.versions.node) ? describe : describe.skip;
  runSuperagent('superagent', function () {
    registerSuperagentTest.call(this);
  });

  describe('SDK CASE 1', function () {
    let sdkControls;

    before(async () => {
      sdkControls = new ProcessControls({
        appPath: path.join(__dirname, 'sdkApp1'),
        useGlobalAgent: true,
        env: {}
      });

      await sdkControls.start(null, null, true);
    });

    it('should not trace example.com exit span without entry span', async () => {
      await delay(2500);

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans.length).to.equal(4);
      });
    });
  });

  describe('SDK CASE 2', function () {
    let sdkControls;

    before(async () => {
      sdkControls = new ProcessControls({
        appPath: path.join(__dirname, 'sdkApp2'),
        useGlobalAgent: true,
        env: {}
      });

      await sdkControls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await sdkControls.stop();
    });

    it('should trace deferred exit calls', async () => {
      await sdkControls.sendRequest({
        method: 'GET',
        path: '/deferred-exit'
      });

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans.length).to.equal(3);
      });
    });
  });

  // When INSTANA_ALLOW_ROOT_EXIT_SPAN is set to TRUE via environment variable
  // it should track the exit spans without parent
  describe('Allow Root Exit Span Case 1', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        appPath: path.join(__dirname, 'allowRootExitSpanApp'),
        useGlobalAgent: true,
        env: {
          INSTANA_ALLOW_ROOT_EXIT_SPAN: true
        }
      });

      await agentControls.start(null, null, true);
    });

    it('should trace exit span without entry span if INSTANA_ALLOW_ROOT_EXIT_SPAN is true', async () => {
      await delay(2500);

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans.length).to.equal(4);
        expect(spans.filter(obj => obj.k === constants.EXIT).length).to.be.equal(4);
        expect(spans.filter(obj => obj.k === constants.ENTRY).length).to.be.equal(0);
      });
    });
  });

  // When INSTANA_ALLOW_ROOT_EXIT_SPAN is set to FALSE via environment variable
  // it should not track the exit spans without parent
  describe('Allow Root Exit Span Case 2', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        appPath: path.join(__dirname, 'allowRootExitSpanApp'),
        useGlobalAgent: true,
        env: {
          INSTANA_ALLOW_ROOT_EXIT_SPAN: false
        }
      });

      await agentControls.start(null, null, true);
    });

    it('should not trace exit span without entry span if INSTANA_ALLOW_ROOT_EXIT_SPAN is false', async () => {
      await delay(500);

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans.length).to.equal(0);
      });
    });
  });

  describe('ignore-endpoints', function () {
    describe('when endpoints are configured to be ignored (with agent config)', function () {
      let serverControls;
      let clientControls;
      const { AgentStubControls } = require('../../../../apps/agentStubControls');
      const customAgentControls = new AgentStubControls();

      before(async () => {
        await customAgentControls.startAgent({
          ignoreEndpoints: {
            http: [
              {
                methods: ['get'],
                endpoints: ['/get-url-only', '/downstream-call']
              }
            ]
          }
        });

        serverControls = new ProcessControls({
          agentControls: customAgentControls,
          appPath: path.join(__dirname, 'serverApp'),
          appUsesHttps: false
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'clientApp'),
          agentControls: customAgentControls,
          appUsesHttps: false,
          env: {
            SERVER_PORT: serverControls.getPort()
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      after(() => Promise.all([serverControls.stop(), clientControls.stop(), customAgentControls.stopAgent()]));

      beforeEach(() => customAgentControls.clearReceivedTraceData());

      afterEach(() => Promise.all([serverControls.clearIpcMessages(), clientControls.clearIpcMessages()]));

      it('should not trace HTTP calls as per ignore config', async () => {
        await clientControls.sendRequest({ method: 'GET', path: '/get-url-only' });

        await retry(async () => {
          const spans = await customAgentControls.getSpans();
          expect(spans).to.have.length(0);
        });
      });

      it('should not trace downstream calls', async () => {
        await clientControls.sendRequest({ method: 'GET', path: '/downstream-call' });

        await retry(async () => {
          const spans = await customAgentControls.getSpans();
          expect(spans).to.have.length(0);
        });
      });
    });

    describe('when endpoints are configured to be ignored via INSTANA_IGNORE_ENDPOINTS_PATH', function () {
      let serverControls;
      let clientControls;

      before(async () => {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'serverApp'),
          useGlobalAgent: true,
          appUsesHttps: false
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'clientApp'),
          useGlobalAgent: true,
          appUsesHttps: false,
          env: {
            SERVER_PORT: serverControls.getPort(),
            INSTANA_IGNORE_ENDPOINTS_PATH: path.join(__dirname, 'files', 'tracing.yaml')
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      after(() => Promise.all([serverControls.stop(), clientControls.stop()]));

      beforeEach(() => globalAgent.instance.clearReceivedTraceData());

      afterEach(() => Promise.all([serverControls.clearIpcMessages(), clientControls.clearIpcMessages()]));

      it('should not trace GET request as per ignore config', async () => {
        await clientControls.sendRequest({ method: 'GET', path: '/get-url-only' });

        await retry(async () => {
          const spans = await globalAgent.instance.getSpans();
          expect(spans).to.have.length(0);
        });
      });

      it('should not trace downstream calls', async () => {
        await clientControls.sendRequest({ method: 'GET', path: '/downstream-call' });

        await retry(async () => {
          const spans = await globalAgent.instance.getSpans();
          expect(spans).to.have.length(0);
        });
      });
    });

    describe('when downstream suppression is disabled via INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION', function () {
      let serverControls;
      let clientControls;

      before(async () => {
        serverControls = new ProcessControls({
          appPath: path.join(__dirname, 'serverApp'),
          useGlobalAgent: true,
          appUsesHttps: false
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'clientApp'),
          useGlobalAgent: true,
          appUsesHttps: false,
          env: {
            SERVER_PORT: serverControls.getPort(),
            INSTANA_IGNORE_ENDPOINTS: 'http:get',
            INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION: true
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      after(() => Promise.all([serverControls.stop(), clientControls.stop()]));

      beforeEach(() => globalAgent.instance.clearReceivedTraceData());

      afterEach(() => Promise.all([serverControls.clearIpcMessages(), clientControls.clearIpcMessages()]));

      // Flow: HTTP entry (ignored)
      //       ├── HTTP Exit (traced)
      it('should trace downstream calls', async () => {
        await clientControls.sendRequest({ method: 'GET', path: '/downstream-call' });

        await retry(async () => {
          const spans = await globalAgent.instance.getSpans();
          const downstreamHttpSpan = spans.find(
            span =>
              span.n === 'node.http.client' &&
              span.k === 2 &&
              span.data.http.method === 'GET' &&
              span.data.http.url === `http://127.0.0.1:${globalAgent.instance.agentPort}/`
          );

          expect(spans).to.have.length(1);
          expect(downstreamHttpSpan).to.exist;
        });
      });
    });

    describe('when downstream call is configured to be ignored', function () {
      let serverControls;
      let clientControls;

      const { AgentStubControls } = require('../../../../apps/agentStubControls');
      const customAgentControls = new AgentStubControls();

      before(async () => {
        await customAgentControls.startAgent({
          ignoreEndpoints: {
            http: [
              {
                methods: ['get'],
                endpoints: [`http://127.0.0.1:${customAgentControls.agentPort}/`]
              }
            ]
          }
        });

        serverControls = new ProcessControls({
          agentControls: customAgentControls,
          appPath: path.join(__dirname, 'serverApp'),
          appUsesHttps: false
        });

        clientControls = new ProcessControls({
          appPath: path.join(__dirname, 'clientApp'),
          agentControls: customAgentControls,
          appUsesHttps: false,
          env: {
            SERVER_PORT: serverControls.getPort()
          }
        });

        await serverControls.startAndWaitForAgentConnection();
        await clientControls.startAndWaitForAgentConnection();
      });

      after(() => Promise.all([serverControls.stop(), clientControls.stop(), customAgentControls.stopAgent()]));

      beforeEach(() => customAgentControls.clearReceivedTraceData());

      afterEach(() => Promise.all([serverControls.clearIpcMessages(), clientControls.clearIpcMessages()]));

      it('should trace downstream calls', async () => {
        await clientControls.sendRequest({ method: 'GET', path: '/downstream-call' });

        await retry(async () => {
          await delay(500);
          const spans = await customAgentControls.getSpans();

          const downstreamHttpSpan = spans.find(
            span =>
              span.n === 'node.http.client' &&
              span.k === 2 &&
              span.data.http.method === 'GET' &&
              span.data.http.url === `http://127.0.0.1:${customAgentControls.agentPort}/`
          );

          expect(spans).to.have.length(2);
          expect(downstreamHttpSpan).to.exist;
        });
      });
    });
  });
});

function registerTests(appUsesHttps) {
  let serverControls;
  let clientControls;

  before(async () => {
    serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'serverApp'),
      useGlobalAgent: true,
      appUsesHttps
    });
    clientControls = new ProcessControls({
      appPath: path.join(__dirname, 'clientApp'),
      useGlobalAgent: true,
      appUsesHttps,
      env: {
        SERVER_PORT: serverControls.getPort()
      }
    });

    await serverControls.startAndWaitForAgentConnection();
    await clientControls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  after(async () => {
    await serverControls.stop();
    await clientControls.stop();
  });

  afterEach(async () => {
    await serverControls.clearIpcMessages();
    await clientControls.clearIpcMessages();
  });

  if (!appUsesHttps) {
    it('must trace request in background', () => {
      return clientControls
        .sendRequest({
          method: 'GET',
          path: '/request-deferred'
        })
        .then(() => {
          return retry(() => {
            return globalAgent.instance.getSpans().then(spans => {
              expect(spans.length).to.equal(3);

              const entryInClient = verifyRootHttpEntry({
                spans,
                host: `localhost:${clientControls.getPort()}`,
                url: '/request-deferred'
              });

              verifyHttpExit({
                spans,
                parent: entryInClient,
                url: `http://127.0.0.1:${globalAgent.instance.agentPort}/`,
                params: 'k=1'
              });

              verifyHttpExit({
                spans,
                parent: entryInClient,
                url: `http://127.0.0.1:${globalAgent.instance.agentPort}/`,
                params: 'k=2'
              });
            });
          });
        });
    });
  }

  // HTTP requests can be triggered via http.request(...) + request.end(...) or http.get(...).
  // Both http.request and http.get accept
  // - an URL, an options object and a callback
  // - only an URL and a callback, or
  // - only an options object (containing the parts of the URL) and a callback.
  // The URL can be a string or an URL object.
  //
  // This following tests cover all variants.
  [true, false].forEach(urlObject => {
    [true, false].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';

      it(`must trace request(${urlParam}, options, cb) with query: ${withQuery}`, () =>
        clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-and-options', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              globalAgent.instance.getSpans().then(spans =>
                verifySpans({
                  spans,
                  appUsesHttps,
                  clientEndpoint: '/request-url-and-options',
                  serverEndpoint: '/request-url-opts',
                  serverControls,
                  clientControls,
                  withQuery,
                  urlShouldContainRedactedCredentials: true
                })
              )
            )
          ));
    });
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';

      // - Can't execute this test with a self signed certificate because without an options object, there is no place
      //   where we can specify the `ca` option.
      const mochaFn = appUsesHttps || urlObject ? it.skip : it;
      mochaFn(`must trace request(${urlParam}, cb) with query: ${withQuery}`, () =>
        clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-only', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              globalAgent.instance.getSpans().then(spans =>
                verifySpans({
                  spans,
                  appUsesHttps,
                  clientEndpoint: '/request-url-only',
                  serverEndpoint: '/request-only-url',
                  serverControls,
                  clientControls,
                  withQuery,
                  urlShouldContainRedactedCredentials: true
                })
              )
            )
          )
      );
    });
  });

  [false, true].forEach(withQuery => {
    it(`must trace request(options, cb) with query: ${withQuery}`, () =>
      clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/request-options-only', false, withQuery)
        })
        .then(() =>
          retry(() =>
            globalAgent.instance.getSpans().then(spans =>
              verifySpans({
                spans,
                appUsesHttps,
                clientEndpoint: '/request-options-only',
                serverEndpoint: '/request-only-opts',
                serverControls,
                clientControls,
                withQuery
              })
            )
          )
        ));
  });

  it('must capture sync exceptions', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-malformed-url'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            const entrySpan = verifyRootHttpEntry({
              spans,
              host: `localhost:${clientControls.getPort()}`,
              url: '/request-malformed-url'
            });
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1),
              span =>
                expect(span.data.http.url).to.match(/ha-te-te-peh:\/\/999\.0\.0\.1(?:\/)?:not-a-port\/malformed-url/),
              span => {
                expect(span.data.http.error).to.match(/Invalid URL/);
              },
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s)
            ]);
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              checkQuery(span, false);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });
          })
        )
      ));

  [false, true].forEach(withQuery => {
    it(`must trace request(options, cb) with { headers: null } with query: ${withQuery}`, () =>
      clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/request-options-only-null-headers', false, withQuery)
        })
        .then(() =>
          retry(() =>
            globalAgent.instance.getSpans().then(spans =>
              verifySpans({
                spans,
                appUsesHttps,
                clientEndpoint: '/request-options-only-null-headers',
                serverEndpoint: '/request-only-opts',
                serverControls,
                clientControls,
                withQuery
              })
            )
          )
        ));
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';

      it(`must trace get(${urlParam}, options, cb) with query: ${withQuery}`, () =>
        clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-and-options', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              globalAgent.instance.getSpans().then(spans =>
                verifySpans({
                  spans,
                  appUsesHttps,
                  clientEndpoint: '/get-url-and-options',
                  serverEndpoint: '/get-url-opts',
                  serverControls,
                  clientControls,
                  withQuery,
                  urlShouldContainRedactedCredentials: true
                })
              )
            )
          ));
    });
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';

      // - Can't execute this test with a self signed certificate because without an options object, there is no place
      //   where we can specify the `ca` option.
      const mochaFn = appUsesHttps || urlObject ? it.skip : it;
      mochaFn(`must trace get(${urlParam}, cb) with query: ${withQuery}`, () =>
        clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-only', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              globalAgent.instance.getSpans().then(spans =>
                verifySpans({
                  spans,
                  appUsesHttps,
                  clientEndpoint: '/get-url-only',
                  serverEndpoint: '/get-only-url',
                  serverControls,
                  clientControls,
                  withQuery,
                  urlShouldContainRedactedCredentials: true
                })
              )
            )
          )
      );
    });
  });

  [false, true].forEach(withQuery => {
    it(`must trace get(options, cb) with query: ${withQuery}`, () =>
      clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/get-options-only', false, withQuery)
        })
        .then(() =>
          retry(() =>
            globalAgent.instance.getSpans().then(spans =>
              verifySpans({
                spans,
                appUsesHttps,
                clientEndpoint: '/get-options-only',
                serverEndpoint: '/get-only-opts',
                serverControls,
                clientControls,
                withQuery
              })
            )
          )
        ));
  });

  it('must trace calls that fail due to timeouts', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/timeout',
        simple: false
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1)
            ]);
          })
        )
      ));

  it('must trace aborted calls', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/abort',
        simple: false
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            const exitInClient = expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.http.error).to.match(/aborted/)
            ]);
            expectExactlyOneMatching(spans, [
              span => expect(span.t).to.equal(exitInClient.t),
              span => expect(span.p).to.equal(exitInClient.s),
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.status).to.not.exist
            ]);
          })
        )
      ));

  it('must capture request headers on outgoing HTTP calls via request options', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-options-only?withHeader=request-via-options'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span =>
                expect(span.data.http.header).to.deep.equal({
                  'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
                  'x-my-exit-options-request-multi-header':
                    'x-my-exit-options-request-multi-header-value-1, x-my-exit-options-request-multi-header-value-2'
                }),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/)
            ]);
          })
        )
      ));

  it('must capture request headers on outgoing HTTP calls when they are set on the request object', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-options-only?withHeader=set-on-request'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span =>
                expect(span.data.http.header).to.deep.equal({
                  'x-my-exit-set-on-request-header': 'x-my-exit-set-on-request-header-value',
                  'x-my-exit-set-on-request-multi-header':
                    'x-my-exit-set-on-request-multi-header-value-1, x-my-exit-set-on-request-multi-header-value-2'
                }),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/)
            ]);
          })
        )
      ));

  it('must capture response headers on outgoing HTTP calls', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-options-only?withHeader=response'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.header).to.exist,
              span =>
                expect(span.data.http.header['x-my-exit-response-header']).to.equal('x-my-exit-response-header-value'),
              span => expect(span.data.http.url).to.match(/\/request-only-opts/)
            ]);
          })
        )
      ));

  it('must record calls with an "Expect: 100-continue" header', () =>
    clientControls
      .sendRequest({
        method: 'put',
        path: '/expect-continue'
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.data.http.method).to.equal('PUT'),
              span => expect(span.data.http.status).to.equal(200),
              span => expect(span.data.http.url).to.match(/\/continue/)
            ]);
          })
        )
      ));

  it('must capture deferred outgoing HTTP calls that are executed after the triggering HTTP entry has finished', () =>
    clientControls.sendRequest({ path: '/deferred-http-exit' }).then(() =>
      retry(() =>
        globalAgent.instance.getSpans().then(spans => {
          const clientSpan = expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.client'),
            span => expect(span.k).to.equal(constants.EXIT),
            span => expect(span.data.http.url).to.match(/\/request-only-opts/)
          ]);
          expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.k).to.equal(constants.ENTRY),
            span => expect(span.data.http.url).to.match(/\/request-only-opts/),
            span => expect(span.t).to.equal(clientSpan.t),
            span => expect(span.p).to.equal(clientSpan.s)
          ]);
        })
      )
    ));

  // This test is always skipped on CI, it is meant to be only activated for manual execution because it needs three
  // additional environment variables that provide access to an S3 bucket. The env vars that need to be set are:
  // AWS_ACCESS_KEY_ID,
  // AWS_SECRET_ACCESS_KEY and
  // AWS_S3_BUCKET_NAME.
  it.skip('must upload to S3', () =>
    clientControls
      .sendRequest({
        method: 'POST',
        path: '/upload-s3'
      })
      .then(response => {
        expect(response.ETag).to.exist;
        expect(response.Location).to.exist;
        expect(response.Bucket).to.exist;
        expect(response.key).to.exist;
        expect(response.Key).to.exist;
      }));
  it('must capture complete request path even if it contain `;`', () =>
    clientControls
      .sendRequest({ method: 'GET', path: '/matrix-params/ACDKey=1:00000:00000;ANI=00000111;DN=00000111' })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => {
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.url).to.eq('/matrix-params/ACDKey=1:00000:00000;ANI=00000111;DN=00000111'),
              span => expect(span.data.http.status).to.eq(200)
            ]);
          })
        )
      ));
}

function registerConnectionRefusalTest(appUsesHttps) {
  // This needs to be in a suite of its own because the test terminates the server app.
  describe('connection refusal', function () {
    let serverControls;
    let clientControls;

    before(async () => {
      serverControls = new ProcessControls({
        appPath: path.join(__dirname, 'serverApp'),
        useGlobalAgent: true,
        appUsesHttps
      });
      clientControls = new ProcessControls({
        appPath: path.join(__dirname, 'clientApp'),
        useGlobalAgent: true,
        appUsesHttps,
        env: {
          SERVER_PORT: serverControls.getPort()
        }
      });

      await serverControls.startAndWaitForAgentConnection();
      await clientControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await globalAgent.instance.clearReceivedTraceData();
    });

    after(async () => {
      await serverControls.stop();
      await clientControls.stop();
    });

    afterEach(async () => {
      await serverControls.clearIpcMessages();
      await clientControls.clearIpcMessages();
    });

    it('must trace calls that fail due to connection refusal', () =>
      serverControls
        .kill()
        .then(() =>
          clientControls.sendRequest({
            method: 'GET',
            path: '/timeout',
            simple: false
          })
        )
        .then(() =>
          retry(() =>
            globalAgent.instance.getSpans().then(spans => {
              expectExactlyOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.client'),
                span => expect(span.k).to.equal(constants.EXIT),
                span => expect(span.ec).to.equal(1),
                span => expect(span.data.http.error).to.match(/ECONNREFUSED/)
              ]);
            })
          )
        ));
  });
}

function registerSuperagentTest() {
  let serverControls;
  let clientControls;

  before(async () => {
    serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'serverApp'),
      useGlobalAgent: true
    });
    clientControls = new ProcessControls({
      appPath: path.join(__dirname, 'superagentApp'),
      useGlobalAgent: true,
      env: {
        SERVER_PORT: serverControls.getPort()
      }
    });

    await serverControls.startAndWaitForAgentConnection();
    await clientControls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  after(async () => {
    await serverControls.stop();
    await clientControls.stop();
  });

  afterEach(async () => {
    await serverControls.clearIpcMessages();
    await clientControls.clearIpcMessages();
  });

  it('must trace superagent callbacks', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/callback')
      })
      .then(() =>
        retry(() =>
          globalAgent.instance
            .getSpans()
            .then(spans =>
              verifySuperagentSpans(spans, '/callback', '/request-url-opts', clientControls, serverControls)
            )
        )
      ));

  it('must trace superagent promises', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/then')
      })
      .then(() =>
        retry(() =>
          globalAgent.instance
            .getSpans()
            .then(spans => verifySuperagentSpans(spans, '/then', '/request-url-opts', clientControls, serverControls))
        )
      ));

  it('must trace superagent promises/catch', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/catch')
      })
      .then(() =>
        retry(() =>
          globalAgent.instance
            .getSpans()
            .then(spans => verifySuperagentSpans(spans, '/catch', '/does-not-exist', clientControls, serverControls))
        )
      ));

  it('must trace superagent with async/await', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/await')
      })
      .then(() =>
        retry(() =>
          globalAgent.instance
            .getSpans()
            .then(spans => verifySuperagentSpans(spans, '/await', '/request-url-opts', clientControls, serverControls))
        )
      ));

  it('must trace superagent with async/await and error', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/await-fail')
      })
      .then(() =>
        retry(() =>
          globalAgent.instance
            .getSpans()
            .then(spans =>
              verifySuperagentSpans(spans, '/await-fail', '/does-not-exist', clientControls, serverControls)
            )
        )
      ));
}

function constructPath(basePath, urlObject, withQuery) {
  if (urlObject && withQuery) {
    return `${basePath}?urlObject=true&withQuery=true`;
  } else if (urlObject) {
    return `${basePath}?urlObject=true`;
  } else if (withQuery) {
    return `${basePath}?withQuery=true`;
  } else {
    return basePath;
  }
}

function verifySpans({
  spans,
  appUsesHttps,
  clientEndpoint,
  serverEndpoint,
  clientControls,
  serverControls,
  withQuery,
  urlShouldContainRedactedCredentials
}) {
  const entryInClient = verifyRootHttpEntry({
    spans,
    host: `localhost:${clientControls.getPort()}`,
    url: clientEndpoint
  });
  const exitInClient = verifyHttpExit({
    spans,
    parent: entryInClient,
    url: serverUrl(appUsesHttps, urlShouldContainRedactedCredentials, serverEndpoint, serverControls)
  });
  checkQuery(exitInClient, withQuery);
  const entryInServer = verifyHttpEntry({
    spans,
    parent: exitInClient,
    host: `localhost:${serverControls.getPort()}`,
    url: serverEndpoint
  });
  checkQuery(entryInServer, withQuery);
  expect(spans).to.have.lengthOf(3);
}

function verifySuperagentSpans(spans, clientEndpoint, serverEndpoint, clientControls, serverControls) {
  const entryInClient = verifyRootHttpEntry({
    spans,
    host: `localhost:${clientControls.getPort()}`,
    url: clientEndpoint
  });
  const firstExitInClient = verifyHttpExit({
    spans,
    parent: entryInClient,
    url: serverUrl(false, false, serverEndpoint, serverControls),
    method: 'GET',
    status: serverEndpoint === '/does-not-exist' ? 404 : 200
  });
  verifyHttpExit({ spans, parent: entryInClient, url: `http://127.0.0.1:${globalAgent.instance.agentPort}/` });
  verifyHttpEntry({
    spans,
    parent: firstExitInClient,
    host: `localhost:${serverControls.getPort()}`,
    url: serverEndpoint,
    method: 'GET',
    status: serverEndpoint === '/does-not-exist' ? 404 : 200
  });
  expect(spans).to.have.lengthOf(4);
}

function verifyRootHttpEntry({ spans, host, url = '/', method = 'GET', status = 200, synthetic = false }) {
  return verifyHttpEntry({ spans, parent: null, host, url, method, status, synthetic });
}

function verifyHttpEntry({ spans, parent, host, url = '/', method = 'GET', status = 200, synthetic = false }) {
  let expectations = [
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.ec).to.equal(0),
    span => expect(span.data.http.url).to.equal(url),
    span => expect(span.data.http.method).to.equal(method),
    span => expect(span.data.http.host).to.equal(host),
    span => expect(span.data.http.status).to.equal(status)
  ];
  if (parent) {
    expectations = expectations.concat([
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.s).to.be.a('string'),
      span => expect(span.p).to.equal(parent.s)
    ]);
  } else {
    expectations = expectations.concat([
      span => expect(span.t).to.be.a('string'),
      span => expect(span.s).to.be.a('string'),
      span => expect(span.p).to.not.exist
    ]);
  }
  expectations.push(span => (synthetic ? expect(span.sy).to.be.true : expect(span.sy).to.not.exist));
  return expectExactlyOneMatching(spans, expectations);
}

function verifyHttpExit({ spans, parent, url = '/', method = 'GET', status = 200, synthetic = false, params = null }) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(parent.t),
    span => expect(span.p).to.equal(parent.s),
    span => expect(span.s).to.be.a('string'),
    span => expect(span.data.http.url).to.equal(url),
    span => expect(span.data.http.method).to.equal(method),
    span => expect(span.data.http.status).to.equal(status),
    span => (params ? expect(span.data.http.params).to.equal(params) : true),
    span => (!synthetic ? expect(span.sy).to.not.exist : expect(span.sy).to.be.true)
  ]);
}

function serverUrl(appUsesHttps, urlShouldContainRedactedCredentials, path_, serverControls) {
  return `http${appUsesHttps ? 's' : ''}://${
    urlShouldContainRedactedCredentials ? '<redacted>:<redacted>@' : ''
  }${`localhost:${serverControls.getPort()}`}${path_}`;
}

function checkQuery(span, withQuery) {
  if (withQuery) {
    expect(span.data.http.params).to.equal('q1=some&pass=<redacted>&q2=value');
  } else {
    expect(span.data.http.params).to.not.exist;
  }
}
