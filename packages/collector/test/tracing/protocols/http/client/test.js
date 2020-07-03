'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const testUtils = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');

let agentControls;

describe('tracing/http client', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

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
    port: 3217,
    agentControls,
    env: {
      USE_HTTPS: useHttps
    }
  }).registerTestHooks();

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'clientApp'),
    port: 3216,
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
      it(`must trace request(${urlParam}, options, cb) with query: ${withQuery}`, () => {
        if (semver.lt(process.versions.node, '10.9.0')) {
          // The (url, options[, callback]) API only exists since Node 10.9.0:
          return;
        }

        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-and-options', urlObject, withQuery)
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/request-url-opts/);
                  checkQuery(span, withQuery);
                });
                testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/request-url-opts/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              })
            )
          );
      });
    });
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';
      it(`must trace request(${urlParam}, cb) with query: ${withQuery}`, () => {
        if (urlObject && semver.lt(process.versions.node, '7.5.0')) {
          // WHATWG URL objects can only be passed since 7.5.0
          return;
        }
        if (useHttps) {
          // Can't execute this test with a self signed certificate because without an options object, there is no place
          // where we can specify the `ca` option.
          return;
        }
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-only', urlObject, withQuery)
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/request-only-url/);
                  checkQuery(span, withQuery);
                });
                testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/request-only-url/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              })
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
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.client');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                checkQuery(span, withQuery);
              });
              testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                expect(span.t).to.equal(clientSpan.t);
                expect(span.p).to.equal(clientSpan.s);
              });
            })
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-malformed-url/);
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.url).to.match(/ha-te-te-peh/);
              expect(span.data.http.error).to.match(/Protocol .* not supported./);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
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
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.client');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                checkQuery(span, withQuery);
              });
              testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                expect(span.t).to.equal(clientSpan.t);
                expect(span.p).to.equal(clientSpan.s);
              });
            })
          )
        ));
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';
      it(`must trace get(${urlParam}, options, cb) with query: ${withQuery}`, () => {
        if (semver.lt(process.versions.node, '10.9.0')) {
          // The (url, options[, callback]) API only exists since Node 10.9.0.
          return;
        }
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-and-options', urlObject, withQuery)
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/get-url-opts/);
                  checkQuery(span, withQuery);
                });
                testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/get-url-opts/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              })
            )
          );
      });
    });
  });

  [false, true].forEach(urlObject => {
    [false, true].forEach(withQuery => {
      const urlParam = urlObject ? 'urlObject' : 'urlString';
      it(`must trace get(${urlParam}, cb) with query: ${withQuery}`, () => {
        if (urlObject && semver.lt(process.versions.node, '7.5.0')) {
          // WHATWG URL objects can only be passed since 7.5.0
          return;
        }
        if (useHttps) {
          // Can't execute this test with a self signed certificate because without an options object, there is no place
          // where we can specify the `ca` option.
          return;
        }
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-only', urlObject, withQuery)
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/get-only-url/);
                  checkQuery(span, withQuery);
                });
                testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/get-only-url/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              })
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
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.client');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.data.http.url).to.match(/\/get-only-opts/);
                checkQuery(span, withQuery);
              });
              testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.data.http.url).to.match(/\/get-only-opts/);
                expect(span.t).to.equal(clientSpan.t);
                expect(span.p).to.equal(clientSpan.s);
              });
            })
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
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
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
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
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.client');
            expect(span.k).to.equal(constants.EXIT);
            expect(span.data.http.url).to.match(/\/request-only-opts/);
          });
          testUtils.expectAtLeastOneMatching(spans, span => {
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
    port: 3217,
    agentControls
  }).registerTestHooks();

  const clientControls = new ProcessControls({
    appPath: path.join(__dirname, 'superagentApp'),
    port: 3216,
    agentControls,
    env: {
      SERVER_PORT: serverControls.port
    }
  }).registerTestHooks();

  it('must trace superagent requests', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: constructPath('/request')
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const clientSpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-url-opts/);
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-url-opts/);
              expect(span.t).to.equal(clientSpan.t);
              expect(span.p).to.equal(clientSpan.s);
            });
          })
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

function checkQuery(span, withQuery) {
  if (withQuery) {
    expect(span.data.http.params).to.equal('q1=some&q2=value');
  } else {
    expect(span.data.http.params).to.not.exist;
  }
}
