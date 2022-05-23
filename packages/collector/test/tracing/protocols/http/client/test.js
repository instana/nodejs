/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { expectExactlyOneMatching, retry } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');

const clientPort = 3216;
const clientHost = `localhost:${clientPort}`;
const serverPort = 3217;
const serverHost = `localhost:${serverPort}`;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/http client', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpTestCaseCleanUpHooks();

  describe('http', function () {
    registerTests.call(this, false);
  });

  describe('https', function () {
    registerTests.call(this, true);
  });

  registerConnectionRefusalTest.call(this, false);
  registerConnectionRefusalTest.call(this, true);

  describe('superagent', function () {
    registerSuperagentTest.call(this);
  });
});

function registerTests(useHttps) {
  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'serverApp'),
    port: serverPort,
    useGlobalAgent: true,
    env: {
      USE_HTTPS: useHttps
    }
  });

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'clientApp'),
    port: clientPort,
    useGlobalAgent: true,
    env: {
      SERVER_PORT: serverControls.port,
      USE_HTTPS: useHttps
    }
  });

  ProcessControls.setUpHooks(serverControls, clientControls);

  // HTTP requests can be triggered via http.request(...) + request.end(...) or http.get(...).
  // Both http.request and http.get accept
  // - an URL, an options object and a callback (since Node 10.9.0),
  // - only an URL and a callback, or
  // - only an options object (containing the parts of the URL) and a callback.
  // The URL can be a string or an URL object.
  //
  // This following tests cover all variants.

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
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
                  useHttps,
                  clientEndpoint: '/request-url-and-options',
                  serverEndpoint: '/request-url-opts',
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
      const mochaFn = useHttps || urlObject ? it.skip : it;
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
                  useHttps,
                  clientEndpoint: '/request-url-only',
                  serverEndpoint: '/request-only-url',
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
                useHttps,
                clientEndpoint: '/request-options-only',
                serverEndpoint: '/request-only-opts',
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
            const entrySpan = verifyRootHttpEntry({ spans, host: clientHost, url: '/request-malformed-url' });
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.ec).to.equal(1),
              span =>
                expect(span.data.http.url).to.match(/ha-te-te-peh:\/\/999\.0\.0\.1(?:\/)?:not-a-port\/malformed-url/),
              span => {
                if (semver.gte(process.version, '16.0.0')) {
                  expect(span.data.http.error).to.match(/Invalid URL/);
                } else {
                  expect(span.data.http.error).to.match(/Protocol .* not supported./);
                }
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
                useHttps,
                clientEndpoint: '/request-options-only-null-headers',
                serverEndpoint: '/request-only-opts',
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
                  useHttps,
                  clientEndpoint: '/get-url-and-options',
                  serverEndpoint: '/get-url-opts',
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
      const mochaFn = useHttps || urlObject ? it.skip : it;
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
                  useHttps,
                  clientEndpoint: '/get-url-only',
                  serverEndpoint: '/get-only-url',
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
                useHttps,
                clientEndpoint: '/get-options-only',
                serverEndpoint: '/get-only-opts',
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
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.http.error).to.match(/Timeout/)
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
}

function registerConnectionRefusalTest(useHttps) {
  // This needs to be in a suite of its own because the test terminates the server app.
  describe('connection refusal', function () {
    const serverControls = new ProcessControls({
      appPath: path.join(__dirname, 'serverApp'),
      port: serverPort,
      useGlobalAgent: true,
      env: {
        USE_HTTPS: useHttps
      }
    });

    const clientControls = new ProcessControls({
      appPath: path.join(__dirname, 'clientApp'),
      port: clientPort,
      useGlobalAgent: true,
      env: {
        SERVER_PORT: serverControls.port,
        USE_HTTPS: useHttps
      }
    });

    ProcessControls.setUpHooks(serverControls, clientControls);

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
  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'serverApp'),
    port: serverPort,
    useGlobalAgent: true
  });

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'superagentApp'),
    port: clientPort,
    useGlobalAgent: true,
    env: {
      SERVER_PORT: serverControls.port
    }
  });

  ProcessControls.setUpHooks(serverControls, clientControls);

  it('must trace superagent callbacks', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/callback')
      })
      .then(() =>
        retry(() =>
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/callback', '/request-url-opts'))
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
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/then', '/request-url-opts'))
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
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/catch', '/does-not-exist'))
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
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/await', '/request-url-opts'))
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
          globalAgent.instance.getSpans().then(spans => verifySuperagentSpans(spans, '/await-fail', '/does-not-exist'))
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
  useHttps,
  clientEndpoint,
  serverEndpoint,
  withQuery,
  urlShouldContainRedactedCredentials
}) {
  const entryInClient = verifyRootHttpEntry({ spans, host: clientHost, url: clientEndpoint });
  const exitInClient = verifyHttpExit({
    spans,
    parent: entryInClient,
    url: serverUrl(useHttps, urlShouldContainRedactedCredentials, serverEndpoint)
  });
  checkQuery(exitInClient, withQuery);
  const entryInServer = verifyHttpEntry({ spans, parent: exitInClient, host: serverHost, url: serverEndpoint });
  checkQuery(entryInServer, withQuery);
  expect(spans).to.have.lengthOf(3);
}

function verifySuperagentSpans(spans, clientEndpoint, serverEndpoint) {
  const entryInClient = verifyRootHttpEntry({ spans, host: clientHost, url: clientEndpoint });
  const firstExitInClient = verifyHttpExit({
    spans,
    parent: entryInClient,
    url: serverUrl(false, false, serverEndpoint),
    method: 'GET',
    status: serverEndpoint === '/does-not-exist' ? 404 : 200
  });
  verifyHttpExit({ spans, parent: entryInClient, url: `http://127.0.0.1:${globalAgent.PORT}/` });
  verifyHttpEntry({
    spans,
    parent: firstExitInClient,
    host: serverHost,
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

function verifyHttpExit({ spans, parent, url = '/', method = 'GET', status = 200, synthetic = false }) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.t).to.equal(parent.t),
    span => expect(span.p).to.equal(parent.s),
    span => expect(span.s).to.be.a('string'),
    span => expect(span.data.http.url).to.equal(url),
    span => expect(span.data.http.method).to.equal(method),
    span => expect(span.data.http.status).to.equal(status),
    span => (!synthetic ? expect(span.sy).to.not.exist : expect(span.sy).to.be.true)
  ]);
}

function serverUrl(useHttps, urlShouldContainRedactedCredentials, path_) {
  return `http${useHttps ? 's' : ''}://${
    urlShouldContainRedactedCredentials ? '<redacted>:<redacted>@' : ''
  }${serverHost}${path_}`;
}

function checkQuery(span, withQuery) {
  if (withQuery) {
    expect(span.data.http.params).to.equal('q1=some&pass=<redacted>&q2=value');
  } else {
    expect(span.data.http.params).to.not.exist;
  }
}
