'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { expectExactlyOneMatching, retry } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');

let agentControls;

const clientPort = 3216;
const clientHost = `localhost:${clientPort}`;
const serverPort = 3217;
const serverHost = `localhost:${serverPort}`;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;
mochaSuiteFn('tracing/http client', function() {
  agentControls = require('../../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks({
    extraHeaders: [
      //
      'X-My-Exit-Options-Request-Header',
      'X-My-Exit-Set-On-Request-Header',
      'X-My-Exit-Response-Header'
    ]
  });

  describe('http', function() {
    registerTests.call(this, false);
  });

  describe('https', function() {
    registerTests.call(this, true);
  });

  describe('superagent', function() {
    registerSuperagentTest.call(this);
  });
});

function registerTests(useHttps) {
  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'serverApp'),
    port: serverPort,
    agentControls,
    env: {
      USE_HTTPS: useHttps
    }
  }).registerTestHooks();

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'clientApp'),
    port: clientPort,
    agentControls,
    env: {
      SERVER_PORT: serverControls.port,
      USE_HTTPS: useHttps
    }
  }).registerTestHooks();

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

      // The (url, options[, callback]) API only exists since Node 10.9.0:
      const mochaFn = semver.lt(process.versions.node, '10.9.0') ? it.skip : it;
      mochaFn(`must trace request(${urlParam}, options, cb) with query: ${withQuery}`, () => {
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-and-options', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              agentControls
                .getSpans()
                .then(spans => verifySpans(spans, useHttps, '/request-url-and-options', '/request-url-opts', withQuery))
            )
          );
      });
    });
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';

      // - Can't execute this test with a self signed certificate because without an options object, there is no place
      //   where we can specify the `ca` option.
      // - WHATWG URL objects can only be passed since 7.5.0
      const mochaFn = useHttps || (urlObject && semver.lt(process.versions.node, '7.5.0')) ? it.skip : it;
      mochaFn(`must trace request(${urlParam}, cb) with query: ${withQuery}`, () => {
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-only', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              agentControls
                .getSpans()
                .then(spans => verifySpans(spans, useHttps, '/request-url-only', '/request-only-url', withQuery))
            )
          );
      });
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
            agentControls
              .getSpans()
              .then(spans => verifySpans(spans, useHttps, '/request-options-only', '/request-only-opts', withQuery))
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
          agentControls.getSpans().then(spans => {
            const entrySpan = verifyRootHttpEntry(spans, clientHost, '/request-malformed-url');
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.url).to.match(/ha-te-te-peh:\/\/999\.0\.0\.1(?:\/)?:not-a-port\/malformed-url/);
              expect(span.data.http.error).to.match(/Protocol .* not supported./);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });
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
            agentControls
              .getSpans()
              .then(spans =>
                verifySpans(spans, useHttps, '/request-options-only-null-headers', '/request-only-opts', withQuery)
              )
          )
        ));
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';

      // The (url, options[, callback]) API only exists since Node 10.9.0.
      const mochaFn = semver.lt(process.versions.node, '10.9.0') ? it.skip : it;
      mochaFn(`must trace get(${urlParam}, options, cb) with query: ${withQuery}`, () => {
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-and-options', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              agentControls
                .getSpans()
                .then(spans => verifySpans(spans, useHttps, '/get-url-and-options', '/get-url-opts', withQuery))
            )
          );
      });
    });
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';

      // - Can't execute this test with a self signed certificate because without an options object, there is no place
      //   where we can specify the `ca` option.
      // - WHATWG URL objects can only be passed since 7.5.0
      const mochaFn = useHttps || (urlObject && semver.lt(process.versions.node, '7.5.0')) ? it.skip : it;
      mochaFn(`must trace get(${urlParam}, cb) with query: ${withQuery}`, () => {
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-only', urlObject, withQuery)
          })
          .then(() =>
            retry(() =>
              agentControls
                .getSpans()
                .then(spans => verifySpans(spans, useHttps, '/get-url-only', '/get-only-url', withQuery))
            )
          );
      });
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
            agentControls
              .getSpans()
              .then(spans => verifySpans(spans, useHttps, '/get-options-only', '/get-only-opts', withQuery))
          )
        ));
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
          agentControls.getSpans().then(spans => {
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/ECONNREFUSED/);
            });
          })
        )
      ));

  it('must trace calls that fail due to timeouts', () =>
    clientControls
      .sendRequest({
        method: 'GET',
        path: '/timeout',
        simple: false
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/Timeout/);
            });
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
          agentControls.getSpans().then(spans => {
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/aborted/);
            });
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
          agentControls.getSpans().then(spans => {
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.header).to.exist;
              expect(span.data.http.header['x-my-exit-options-request-header']).to.equal(
                'x-my-exit-options-request-header-value'
              );
              expect(span.data.http.url).to.match(/\/request-only-opts/);
            });
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
          agentControls.getSpans().then(spans => {
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.header).to.exist;
              expect(span.data.http.header['x-my-exit-set-on-request-header']).to.equal(
                'x-my-exit-set-on-request-header-value'
              );
              expect(span.data.http.url).to.match(/\/request-only-opts/);
            });
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
          agentControls.getSpans().then(spans => {
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.header).to.exist;
              expect(span.data.http.header['x-my-exit-response-header']).to.equal('x-my-exit-response-header-value');
              expect(span.data.http.url).to.match(/\/request-only-opts/);
            });
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
          agentControls.getSpans().then(spans => {
            expectExactlyOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.method).to.equal('PUT');
              expect(span.data.http.status).to.equal(200);
              expect(span.data.http.url).to.match(/\/continue/);
            });
          })
        )
      ));

  it('must capture deferred outgoing HTTP calls that are executed after the triggering HTTP entry has finished', () =>
    clientControls.sendRequest({ path: '/deferred-http-exit' }).then(() =>
      retry(() =>
        agentControls.getSpans().then(spans => {
          const clientSpan = expectExactlyOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.k).to.equal(constants.EXIT);
            expect(span.data.http.url).to.match(/\/request-only-opts/);
          });
          expectExactlyOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.http.url).to.match(/\/request-only-opts/);
            expect(span.t).to.equal(clientSpan.t);
            expect(span.p).to.equal(clientSpan.s);
          });
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

function registerSuperagentTest() {
  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'serverApp'),
    port: serverPort,
    agentControls
  }).registerTestHooks();

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'superagentApp'),
    port: clientPort,
    agentControls,
    env: {
      SERVER_PORT: serverControls.port
    }
  }).registerTestHooks();

  it('must trace superagent callbacks', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/callback')
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => verifySuperagentSpans(spans, '/callback', '/request-url-opts'))
        )
      );
  });

  it('must trace superagent promises', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/then')
      })
      .then(() =>
        retry(() => agentControls.getSpans().then(spans => verifySuperagentSpans(spans, '/then', '/request-url-opts')))
      );
  });

  it('must trace superagent promises/catch', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/catch')
      })
      .then(() =>
        retry(() => agentControls.getSpans().then(spans => verifySuperagentSpans(spans, '/catch', '/does-not-exist')))
      );
  });

  it('must trace superagent with async/await', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/await')
      })
      .then(() =>
        retry(() => agentControls.getSpans().then(spans => verifySuperagentSpans(spans, '/await', '/request-url-opts')))
      );
  });

  it('must trace superagent with async/await and error', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/await-fail')
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => verifySuperagentSpans(spans, '/await-fail', '/does-not-exist'))
        )
      );
  });
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

function verifySpans(spans, useHttps, clientEndpoint, serverEndpoint, withQuery) {
  const entryInClient = verifyRootHttpEntry(spans, clientHost, clientEndpoint);
  const exitInClient = verifyHttpExit(spans, entryInClient, serverUrl(useHttps, serverEndpoint));
  checkQuery(exitInClient, withQuery);
  verifyHttpEntry(spans, exitInClient, serverHost, serverEndpoint);
  expect(spans).to.have.lengthOf(3);
}

function verifySuperagentSpans(spans, clientEndpoint, serverEndpoint) {
  const entryInClient = verifyRootHttpEntry(spans, clientHost, clientEndpoint);
  const firstExitInClient = verifyHttpExit(
    spans,
    entryInClient,
    serverUrl(false, serverEndpoint),
    'GET',
    serverEndpoint === '/does-not-exist' ? 404 : 200
  );
  verifyHttpExit(spans, entryInClient, 'http://127.0.0.1:3210/');
  verifyHttpEntry(
    spans,
    firstExitInClient,
    serverHost,
    serverEndpoint,
    'GET',
    serverEndpoint === '/does-not-exist' ? 404 : 200
  );
  expect(spans).to.have.lengthOf(4);
}

function verifyRootHttpEntry(spans, host, url = '/', method = 'GET', status = 200, synthetic = false) {
  return verifyHttpEntry(spans, null, host, url, method, status, synthetic);
}

function verifyHttpEntry(spans, parent, host, url = '/', method = 'GET', status = 200, synthetic = false) {
  return expectExactlyOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.server');
    expect(span.k).to.equal(constants.ENTRY);
    expect(span.ec).to.equal(0);
    if (parent) {
      expect(span.t).to.equal(parent.t);
      expect(span.s).to.be.a('string');
      expect(span.p).to.equal(parent.s);
    } else {
      expect(span.t).to.be.a('string');
      expect(span.s).to.be.a('string');
      expect(span.p).to.not.exist;
    }
    if (!synthetic) {
      expect(span.sy).to.not.exist;
    } else {
      expect(span.sy).to.be.true;
    }
    expect(span.data.http.url).to.equal(url);
    expect(span.data.http.method).to.equal(method);
    expect(span.data.http.host).to.equal(host);
    expect(span.data.http.status).to.equal(status);
  });
}

function verifyHttpExit(spans, parent, url = '/', method = 'GET', status = 200, synthetic = false) {
  return expectExactlyOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.client');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.s).to.be.a('string');
    expect(span.data.http.url).to.equal(url);
    expect(span.data.http.method).to.equal(method);
    expect(span.data.http.status).to.equal(status);
    if (!synthetic) {
      expect(span.sy).to.not.exist;
    } else {
      expect(span.sy).to.be.true;
    }
  });
}

function serverUrl(useHttps, path_) {
  return `http${
    useHttps && semver.satisfies(process.versions.node, '8.x && !8.9.0') ? 's' : ''
  }://${serverHost}${path_}`;
}

function checkQuery(span, withQuery) {
  if (withQuery) {
    expect(span.data.http.params).to.equal('q1=some&q2=value');
  } else {
    expect(span.data.http.params).to.not.exist;
  }
}
