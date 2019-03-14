'use strict';

var expect = require('chai').expect;
var semver = require('semver');

var constants = require('../../../../src/tracing/constants');
var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

var agentControls;
var ClientControls;
var ServerControls;

describe('tracing/http client', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');
  ClientControls = require('./clientControls');
  ServerControls = require('./serverControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks({
    extraHeaders: ['fooBaR']
  });

  describe('http', function() {
    registerTests.call(this, false);
  });

  describe('https', function() {
    registerTests.call(this, true);
  });
});

function registerTests(useHttps) {
  var serverControls = new ServerControls({
    agentControls: agentControls,
    env: {
      USE_HTTPS: useHttps
    }
  });
  serverControls.registerTestHooks();

  var clientControls = new ClientControls({
    agentControls: agentControls,
    env: {
      SERVER_PORT: serverControls.port,
      USE_HTTPS: useHttps
    }
  });
  clientControls.registerTestHooks();

  // HTTP requests can be triggered via http.request(...) + request.end(...) or http.get(...).
  // Both http.request and http.get accept
  // - an URL, an options object and a callback (since Node 10.9.0),
  // - only an URL and a callback, or
  // - only an options object (containing the parts of the URL) and a callback.
  // The URL can be a string or an URL object.
  //
  // This following tests cover all variants.

  [false, true].forEach(function(urlObject) {
    [false, true].forEach(function(withQuery) {
      var urlParam = urlObject ? 'urlObject' : 'urlString';
      it('must trace request(' + urlParam + ', options, cb) with query: ' + withQuery, function() {
        if (semver.lt(process.versions.node, '10.9.0')) {
          // The (url, options[, callback]) API only exists since Node 10.9.0:
          return;
        }

        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-and-options', urlObject, withQuery)
          })
          .then(function() {
            return utils.retry(function() {
              return agentControls.getSpans().then(function(spans) {
                var clientSpan = utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/request-url-opts/);
                  checkQuery(span, withQuery);
                });
                utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/request-url-opts/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              });
            });
          });
      });
    });
  });

  [false, true].forEach(function(urlObject) {
    [false, true].forEach(function(withQuery) {
      var urlParam = urlObject ? 'urlObject' : 'urlString';
      it('must trace request(' + urlParam + ', cb) with query: ' + withQuery, function() {
        if (urlObject && semver.lt(process.versions.node, '7.5.0')) {
          // WHATWG URL objects can only be passed since 7.5.0
          return;
        }
        if (useHttps) {
          // Can't execute this test with a self signed certificate because without an options object, there is no place
          // where we can specify the `rejectUnauthorized: false` option.
          return;
        }
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/request-url-only', urlObject, withQuery)
          })
          .then(function() {
            return utils.retry(function() {
              return agentControls.getSpans().then(function(spans) {
                var clientSpan = utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/request-only-url/);
                  checkQuery(span, withQuery);
                });
                utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/request-only-url/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              });
            });
          });
      });
    });
  });

  [false, true].forEach(function(withQuery) {
    it('must trace request(options, cb) with query: ' + withQuery, function() {
      return clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/request-options-only', false, withQuery)
        })
        .then(function() {
          return utils.retry(function() {
            return agentControls.getSpans().then(function(spans) {
              var clientSpan = utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.client');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                checkQuery(span, withQuery);
              });
              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                expect(span.t).to.equal(clientSpan.t);
                expect(span.p).to.equal(clientSpan.s);
              });
            });
          });
        });
    });
  });

  it('must capture sync exceptions', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/request-malformed-url'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/request-malformed-url/);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.url).to.match(/ha-te-te-peh/);
              expect(span.data.http.error).to.match(/Protocol .* not supported./);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.url).to.match(/\/request-only-opts/);
              checkQuery(span, false);
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
            });
          });
        });
      });
  });

  [false, true].forEach(function(withQuery) {
    it('must trace request(options, cb) with { headers: null } with query: ' + withQuery, function() {
      return clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/request-options-only-null-headers', false, withQuery)
        })
        .then(function() {
          return utils.retry(function() {
            return agentControls.getSpans().then(function(spans) {
              var clientSpan = utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.client');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                checkQuery(span, withQuery);
              });
              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.data.http.url).to.match(/\/request-only-opts/);
                expect(span.t).to.equal(clientSpan.t);
                expect(span.p).to.equal(clientSpan.s);
              });
            });
          });
        });
    });
  });

  [false, true].forEach(function(urlObject) {
    [false, true].forEach(function(withQuery) {
      var urlParam = urlObject ? 'urlObject' : 'urlString';
      it('must trace get(' + urlParam + ', options, cb) with query: ' + withQuery, function() {
        if (semver.lt(process.versions.node, '10.9.0')) {
          // The (url, options[, callback]) API only exists since Node 10.9.0.
          return;
        }
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-and-options', urlObject, withQuery)
          })
          .then(function() {
            return utils.retry(function() {
              return agentControls.getSpans().then(function(spans) {
                var clientSpan = utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/get-url-opts/);
                  checkQuery(span, withQuery);
                });
                utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/get-url-opts/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              });
            });
          });
      });
    });
  });

  [false, true].forEach(function(urlObject) {
    [false, true].forEach(function(withQuery) {
      var urlParam = urlObject ? 'urlObject' : 'urlString';
      it('must trace get(' + urlParam + ', cb) with query: ' + withQuery, function() {
        if (urlObject && semver.lt(process.versions.node, '7.5.0')) {
          // WHATWG URL objects can only be passed since 7.5.0
          return;
        }
        if (useHttps) {
          // Can't execute this test with a self signed certificate because without an options object, there is no place
          // where we can specify the `rejectUnauthorized: false` option.
          return;
        }
        return clientControls
          .sendRequest({
            method: 'GET',
            path: constructPath('/get-url-only', urlObject, withQuery)
          })
          .then(function() {
            return utils.retry(function() {
              return agentControls.getSpans().then(function(spans) {
                var clientSpan = utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.data.http.url).to.match(/\/get-only-url/);
                  checkQuery(span, withQuery);
                });
                utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.url).to.match(/\/get-only-url/);
                  expect(span.t).to.equal(clientSpan.t);
                  expect(span.p).to.equal(clientSpan.s);
                });
              });
            });
          });
      });
    });
  });

  [false, true].forEach(function(withQuery) {
    it('must trace get(options, cb) with query: ' + withQuery, function() {
      return clientControls
        .sendRequest({
          method: 'GET',
          path: constructPath('/get-options-only', false, withQuery)
        })
        .then(function() {
          return utils.retry(function() {
            return agentControls.getSpans().then(function(spans) {
              var clientSpan = utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.client');
                expect(span.k).to.equal(constants.EXIT);
                expect(span.data.http.url).to.match(/\/get-only-opts/);
                checkQuery(span, withQuery);
              });
              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.data.http.url).to.match(/\/get-only-opts/);
                expect(span.t).to.equal(clientSpan.t);
                expect(span.p).to.equal(clientSpan.s);
              });
            });
          });
        });
    });
  });

  it('must trace calls that fail due to connection refusal', function() {
    return serverControls
      .kill()
      .then(function() {
        return clientControls.sendRequest({
          method: 'GET',
          path: '/timeout',
          simple: false
        });
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/ECONNREFUSED/);
            });
          });
        });
      });
  });

  it('must trace calls that fail due to timeouts', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/timeout',
        simple: false
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/Timeout/);
            });
          });
        });
      });
  });

  it('must trace aborted calls', function() {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/abort',
        simple: false
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/aborted/);
            });
          });
        });
      });
  });

  it('must not record custom headers', function() {
    // only http entries are supposed to capture headers, not http exits
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.header).to.not.exist;
            });
          });
        });
      });
  });

  it('must record calls with an "Expect: 100-continue" header', function() {
    return clientControls
      .sendRequest({
        method: 'put',
        path: '/expect-continue'
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.data.http.method).to.equal('PUT');
              expect(span.data.http.status).to.equal(200);
              expect(span.data.http.url).to.match(/\/continue/);
            });
          });
        });
      });
  });

  // This test is always skipped on CI, it is meant to be only activated for manual execution because it needs three
  // additional environment variables that provide access to an S3 bucket. The env vars that need to be set are:
  // AWS_ACCESS_KEY_ID,
  // AWS_SECRET_ACCESS_KEY and
  // AWS_S3_BUCKET_NAME.
  it.skip('must upload to S3', function() {
    return clientControls.sendRequest({
      method: 'POST',
      path: '/upload-s3'
    });
  });
}

function constructPath(basePath, urlObject, withQuery) {
  if (urlObject && withQuery) {
    return basePath + '?urlObject=true&withQuery=true';
  } else if (urlObject) {
    return basePath + '?urlObject=true';
  } else if (withQuery) {
    return basePath + '?withQuery=true';
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
