/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const { expect } = require('chai');
const { fail } = expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { delay, retry } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const { AgentStubControls } = require('../../../../apps/agentStubControls');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/http(s) server', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = new AgentStubControls();

  before(async () => {
    await agentControls.startAgent({
      extraHeaders: [
        //
        'content-type',
        'X-My-Entry-Request-Header',
        'X-My-Entry-Request-Multi-Header',
        'X-My-Entry-Response-Header',
        'X-My-Entry-Response-Multi-Header',
        'X-Write-Head-Response-Header',
        'X-Write-Head-Response-Multi-Header'
      ],
      secretsList: ['secret', 'Enigma', 'CIPHER']
    });
  });

  after(async () => {
    await agentControls.stopAgent();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedData();
  });

  afterEach(async () => {
    await agentControls.clearReceivedData();
  });

  describe('http', function () {
    registerTests.call(this, agentControls, false, false);
  });

  describe('https', function () {
    registerTests.call(this, agentControls, true, false);
  });

  describe('http2 compat mode', function () {
    registerTests.call(this, agentControls, true, true);
  });
});

function registerTests(agentControls, appUsesHttps, useHttp2CompatApi) {
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      http2: useHttp2CompatApi,
      agentControls,
      appUsesHttps: true,
      env: {
        APP_USES_HTTP2: useHttp2CompatApi
      }
    });
    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it(`must capture incoming calls and start a new trace (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        qs: {
          responseStatus: 201
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/checkout', 'POST', 201, false, false);
            expect(span.t).to.be.a('string');
            expect(span.t).to.have.lengthOf(16);
            expect(span.p).to.not.exist;
          })
        )
      ));

  it(`must continue incoming trace (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        qs: {
          responseStatus: 201
        },
        headers: {
          'X-INSTANA-T': '84e588b697868fee',
          'X-INSTANA-S': '5e734f51bce69eca',
          'X-INSTANA-L': '1'
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/checkout', 'POST', 201, false, false);
            expect(span.t).to.equal('84e588b697868fee');
            expect(span.p).to.equal('5e734f51bce69eca');
            expect(span.s).to.be.a('string');
          })
        )
      ));

  it(`must continue incoming trace with 128bit traceIds (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        qs: {
          responseStatus: 201
        },
        headers: {
          'X-INSTANA-T': '6636f38f0f3dd0996636f38f0f3dd099',
          'X-INSTANA-S': 'fb2bb293ac206c05',
          'X-INSTANA-L': '1'
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/checkout', 'POST', 201, false, false);
            expect(span.t).to.equal('6636f38f0f3dd099');
            expect(span.p).to.equal('fb2bb293ac206c05');
          })
        )
      ));

  it(`must suppress (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        qs: {
          responseStatus: 201
        },
        headers: {
          'X-INSTANA-L': '0'
        }
      })
      .then(() => delay(500))
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(0);
        })
      ));

  it(`must suppress when X-INSTANA-L has trailing content (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        qs: {
          responseStatus: 201
        },
        headers: {
          'X-INSTANA-L': '0trailingcontet'
        }
      })
      .then(() => delay(500))
      .then(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(0);
        })
      ));

  it(`must start a new trace with correlation ID (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        qs: {
          responseStatus: 201
        },
        headers: {
          'X-INSTANA-T': '84e588b697868fee',
          'X-INSTANA-S': '5e734f51bce69eca',
          'X-INSTANA-L': '1,correlationType=web;correlationId=abcdef0123456789'
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/checkout', 'POST', 201, false, false);
            expect(span.t).to.be.a('string');
            expect(span.t).to.have.lengthOf(16);
            expect(span.t).to.not.equal('84e588b697868fee');
            expect(span.p).to.not.exist;
            expect(span.crtp).to.equal('web');
            expect(span.crid).to.equal('abcdef0123456789');
          })
        )
      ));

  it(`must mark HTTP entry as erroneous (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        simple: false,
        qs: {
          responseStatus: 500
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/checkout', 'POST', 500, true, false);
            expect(span.t).to.be.a('string');
            expect(span.t).to.have.lengthOf(16);
            expect(span.p).to.not.exist;
          })
        )
      ));

  it(`must mark HTTP entry as synthetic (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/health',
        headers: {
          'X-INSTANA-SYNTHETIC': '1'
        }
      })
      .then(() => delay(500))
      .then(() =>
        agentControls.getSpans().then(spans => {
          verifyThereIsExactlyOneHttpEntry(spans, controls, '/health', 'GET', 200, false, true);
        })
      ));

  it(`must capture configured request headers when present (HTTPS: ${appUsesHttps})`, () => {
    const requestHeaderValue = 'Request Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/',
        headers: {
          'X-MY-ENTRY-REQUEST-HEADER': requestHeaderValue,
          'X-MY-ENTRY-REQUEST-MULTI-HEADER': ['value1', 'value2'],
          'X-MY-ENTRY-REQUEST-NOT-CAPTURED-HEADER': requestHeaderValue
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.header).to.be.an('object');
            if (this.title === 'http2 compat mode') {
              expect(span.data.http.header).to.deep.equal({
                'x-my-entry-request-header': requestHeaderValue,
                'x-my-entry-request-multi-header': 'value1, value2'
              });
            } else {
              expect(span.data.http.header).to.deep.equal({
                'x-my-entry-request-header': requestHeaderValue,
                'x-my-entry-request-multi-header': 'value1,value2'
              });
            }
          })
        )
      );
  });

  it(`must capture configured response headers when present (HTTPS: ${appUsesHttps})`, () => {
    const expectedResponeHeaderValue = 'Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?responseHeader=true'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.header).to.be.an('object');
            expect(span.data.http.header).to.deep.equal({
              'x-my-entry-response-header': expectedResponeHeaderValue,
              'x-my-entry-response-multi-header': 'value1, value2'
            });
          })
        )
      );
  });

  it(`must capture response headers written directly to the response (HTTPS: ${appUsesHttps})`, () => {
    const expectedResponeHeaderValue = 'Write Head Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?writeHead=true'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.header).to.be.an('object');
            expect(span.data.http.header).to.deep.equal({
              'content-type': 'text/plain',
              'x-write-head-response-header': expectedResponeHeaderValue,
              'x-write-head-response-multi-header': 'value1, value2'
            });
          })
        )
      );
  });

  it(`must capture configured request and response headers when present (HTTPS: ${appUsesHttps})`, () => {
    const requestHeaderValue = 'Request Header Value';
    const expectedResponeHeaderValue = 'Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?responseHeader=true',
        headers: {
          'X-MY-ENTRY-REQUEST-HEADER': requestHeaderValue,
          'X-MY-ENTRY-REQUEST-MULTI-HEADER': ['value1', 'value2'],
          'X-MY-ENTRY-REQUEST-NOT-CAPTURED-HEADER': requestHeaderValue
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.header).to.be.an('object');
            if (this.title === 'http2 compat mode') {
              expect(span.data.http.header).to.deep.equal({
                'x-my-entry-request-header': requestHeaderValue,
                'x-my-entry-request-multi-header': 'value1, value2',
                'x-my-entry-response-header': expectedResponeHeaderValue,
                'x-my-entry-response-multi-header': 'value1, value2'
              });
            } else {
              expect(span.data.http.header).to.deep.equal({
                'x-my-entry-request-header': requestHeaderValue,
                'x-my-entry-request-multi-header': 'value1,value2',
                'x-my-entry-response-header': expectedResponeHeaderValue,
                'x-my-entry-response-multi-header': 'value1, value2'
              });
            }
          })
        )
      );
  });

  it(//
  `must capture both response headers for response & other headers (HTTPS: ${appUsesHttps})`, () => {
    const requestHeaderValue = 'Request Header Value';
    const expectedResponeHeaderValue1 = 'Response Header Value';
    const expectedResponeHeaderValue2 = 'Write Head Response Header Value';
    return controls
      .sendRequest({
        method: 'GET',
        path: '/?responseHeader=true&writeHead=true',
        headers: {
          'X-MY-ENTRY-REQUEST-HEADER': requestHeaderValue,
          'X-MY-ENTRY-REQUEST-MULTI-HEADER': ['value1', 'value2'],
          'X-MY-ENTRY-REQUEST-NOT-CAPTURED-HEADER': requestHeaderValue
        }
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.header).to.be.an('object');
            if (this.title === 'http2 compat mode') {
              expect(span.data.http.header).to.deep.equal({
                'content-type': 'text/plain',
                'x-my-entry-request-header': requestHeaderValue,
                'x-my-entry-request-multi-header': 'value1, value2',
                'x-my-entry-response-header': expectedResponeHeaderValue1,
                'x-my-entry-response-multi-header': 'value1, value2',
                'x-write-head-response-header': expectedResponeHeaderValue2,
                'x-write-head-response-multi-header': 'value1, value2'
              });
            } else {
              expect(span.data.http.header).to.deep.equal({
                'content-type': 'text/plain',
                'x-my-entry-request-header': requestHeaderValue,
                'x-my-entry-request-multi-header': 'value1,value2',
                'x-my-entry-response-header': expectedResponeHeaderValue1,
                'x-my-entry-response-multi-header': 'value1, value2',
                'x-write-head-response-header': expectedResponeHeaderValue2,
                'x-write-head-response-multi-header': 'value1, value2'
              });
            }
          })
        )
      );
  });

  // eslint-disable-next-line max-len
  it(`must not contain the header field when neither request nor response headers are present (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.header).to.not.exist;
          })
        )
      ));

  it('must capture request params', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/resource?stan=isalwayswatching&neversleeps'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/resource', 'POST', 200, false, false);
            expect(span.data.http.params).to.equal('stan=isalwayswatching&neversleeps');
          })
        )
      ));

  it(`must remove secrets from query parameters (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/?param1=value1&TheSecreT=classified&param2=value2&enIgmAtic=occult&param3=value4&cipher=veiled'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.params).to.equal(
              'param1=value1&TheSecreT=<redacted>&param2=value2&enIgmAtic=<redacted>&param3=value4&cipher=<redacted>'
            );
          })
        )
      ));

  // Skip this test because native fetch does not allow URLs with embedded credentials
  // Error: "Request cannot be constructed from a URL that includes credentials"
  // This is a security feature of the Fetch API standard
  it.skip(`must not collect credentials embedded in URLs (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/',
        embedCredentialsInUrl: 'user:password@'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(spans, controls, '/', 'GET', 200, false, false);
            expect(span.data.http.host).to.not.include('user');
            expect(span.data.http.host).to.not.include('password');
          })
        )
      ));

  it('must not touch headers set by the application', () => {
    const expectedCookie = 'sessionId=42';
    return controls
      .sendRequest({
        qs: {
          cookie: expectedCookie
        },
        resolveWithFullResponse: true
      })
      .then(response => {
        const responseHeaders =
          response.headers['set-cookie'] ||
          (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : null);
        expect(responseHeaders).to.deep.equal([expectedCookie]);
      });
  });

  it(`must capture an HTTP entry when the client closes the connection (HTTPS: ${appUsesHttps})`, async () => {
    const requestPromise = controls.sendRequest({
      path: '/dont-respond',
      simple: false
    });
    await delay(200);

    // Verify that an entry span has been created even though the request hasn't completed yet
    // The span is captured when the client closes the connection via the req.on('close') event
    await retry(() =>
      agentControls.getSpans().then(spans => {
        // Note: For HTTP 1, the captured HTTP status will be 200 even for a client timeout, because the we take
        // the status from the response object which is created before the request is processed by user code. The
        // default for the status attribute is 200 and so this is what we capture (or whatever the user code sets
        // on the response object before running the request is aborted due to the timeout). For HTTP 2, the
        // situation is different because we inspect a response header of the stream (HTTP2_HEADER_STATUS), which
        // does not exist until a response is actually sent. Thus, for HTTP 2, span.data.http.status will be
        // undefined.
        verifyThereIsExactlyOneHttpEntry(spans, controls, '/dont-respond', 'GET', 200, false, false);
      })
    );

    // The request will eventually complete after 4 seconds (as defined in app.js)
    return requestPromise.catch(() => {});
  });

  it(`must capture an HTTP entry when the server destroys the socket (HTTPS: ${appUsesHttps})`, () =>
    controls
      .sendRequest({
        path: '/destroy-socket',
        simple: false
      })
      .then(() => {
        fail('Expected the HTTP connection to be closed by the server.');
      })
      .catch(err => {
        if (err.error?.code === 'ECONNRESET' || err.code === 'ECONNRESET' || err.cause?.code === 'UND_ERR_SOCKET') {
          // We actually expect the request to time out. But we still want to verify that an entry span has been created
          // for it.
          return retry(() =>
            agentControls.getSpans().then(spans => {
              // Note: For HTTP 1, the captured HTTP status will be 200 even when the server destroys the socket before
              // responding, because the we take the status from the response object which is created before the request
              // is processed by user code. The default for the status attribute is 200 and so this is what we capture
              // (or whatever the user code sets on the response object before running the request is aborted due to the
              // timeout). For HTTP 2, the situation is different because we inspect a response header of the stream
              // (HTTP2_HEADER_STATUS), which does not exist until a response is actually sent. Thus, for HTTP 2,
              // span.data.http.status will be undefined.
              verifyThereIsExactlyOneHttpEntry(spans, controls, '/destroy-socket', 'GET', undefined, false, false);
            })
          );
        } else {
          throw err;
        }
      }));

  describe('Server-Timing header', () => {
    it('must expose trace id as Server-Timing header', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          resolveWithFullResponse: true
        })
        .then(res => {
          const responseHeaders = res.headers['server-timing'] || res.headers.get('server-timing');
          expect(responseHeaders).to.match(/^intid;desc=[a-f0-9]+$/);
        }));

    it('must also expose trace id as Server-Timing header when X-INSTANA-T and -S are incoming', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          resolveWithFullResponse: true,
          headers: {
            'X-INSTANA-T': '84e588b697868fee',
            'X-INSTANA-S': '5e734f51bce69eca'
          }
        })
        .then(res => {
          const responseHeaders = res.headers['server-timing'] || res.headers.get('server-timing');
          expect(responseHeaders).to.equal('intid;desc=84e588b697868fee');
        }));

    it('must expose trace id as Server-Timing header: Custom server-timing string', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/checkout?server-timing-string=true',
          resolveWithFullResponse: true
        })
        .then(res => {
          const responseHeaders = res.headers['server-timing'] || res.headers.get('server-timing');
          expect(responseHeaders).to.match(/^myServerTimingKey, intid;desc=[a-f0-9]+$/);
        }));

    it('must expose trace id as Server-Timing header: Custom server-timing array', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/checkout?server-timing-array=true',
          resolveWithFullResponse: true
        })
        .then(res => {
          const responseHeaders = res.headers['server-timing'] || res.headers.get('server-timing');
          expect(responseHeaders).to.match(/^key1, key2;dur=42, intid;desc=[a-f0-9]+$/);
        }));

    it(
      'must not append another key-value pair when the (string) Server-Timing header already has intid: ' +
        'Custom server-timing string',
      () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/checkout?server-timing-string-with-intid=true',
            resolveWithFullResponse: true
          })
          .then(res => {
            const responseHeaders = res.headers['server-timing'] || res.headers.get('server-timing');
            expect(responseHeaders).to.equal('myServerTimingKey, intid;desc=1234567890abcdef');
          })
    );

    it(
      'must not append another key-value pair when the (array) Server-Timing header already has intid: ' +
        'Custom server-timing string',
      () =>
        controls
          .sendRequest({
            method: 'POST',
            path: '/checkout?server-timing-array-with-intid=true',
            resolveWithFullResponse: true
          })
          .then(res => {
            const responseHeaders = res.headers['server-timing'] || res.headers.get('server-timing');
            expect(responseHeaders).to.equal('key1, key2;dur=42, intid;desc=1234567890abcdef');
          })
    );
  });

  it('must expose trace ID on incoming HTTP request', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/inject-instana-trace-id',
        responseStatus: 200
      })
      .then(response => {
        expect(response).to.match(/^Instana Trace ID: [a-f0-9]{16}$/);

        const traceId = /^Instana Trace ID: ([a-f0-9]{16})$/.exec(response)[1];
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const span = verifyThereIsExactlyOneHttpEntry(
              spans,
              controls,
              '/inject-instana-trace-id',
              'GET',
              200,
              false,
              false
            );
            expect(span.t).to.equal(traceId);
          })
        );
      }));
}

function verifyThereIsExactlyOneHttpEntry(spans, controls, url, method, status, erroneous, synthetic) {
  expect(spans.length).to.equal(1);
  const span = spans[0];
  verifyHttpEntry(span, controls, status, url, method, erroneous, synthetic);
  return span;
}

function verifyHttpEntry(span, controls, status, url = '/', method = 'GET', erroneous = false, synthetic = false) {
  expect(span.n).to.equal('node.http.server');
  expect(span.k).to.equal(constants.ENTRY);
  expect(span.async).to.not.exist;
  expect(span.error).to.not.exist;
  if (erroneous) {
    expect(span.ec).to.equal(1);
  } else {
    expect(span.ec).to.equal(0);
  }
  expect(span.t).to.be.a('string');
  expect(span.s).to.be.a('string');
  if (!synthetic) {
    expect(span.sy).to.not.exist;
  } else {
    expect(span.sy).to.be.true;
  }
  expect(span.data.http.method).to.equal(method);
  expect(span.data.http.url).to.equal(url);
  expect(span.data.http.host).to.equal(`localhost:${controls.getPort()}`);
  expect(span.data.http.status).to.equal(status);
}
