/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const { delay, expectExactlyOneMatching, retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const instrumentation = require('@_local/core/src/tracing/instrumentation/protocols/nativeFetch');

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();

  const commonEnv = {
    LIBRARY_LATEST: isLatest,
    LIBRARY_VERSION: version,
    LIBRARY_NAME: name
  };

  let serverControls;
  let clientControls;

  before(async () => {
    serverControls = new ProcessControls({
      dirname: __dirname,
      appName: 'serverApp',
      useGlobalAgent: true
    });
    clientControls = new ProcessControls({
      dirname: __dirname,
      appName: 'clientApp',
      useGlobalAgent: true,
      env: {
        ...commonEnv,
        SERVER_PORT: serverControls.port
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

  it('must trace request in background', () => {
    return clientControls
      .sendRequest({
        method: 'GET',
        path: '/fetch-deferred'
      })
      .then(() => {
        return retry(() => {
          return globalAgent.instance.getSpans().then(spans => {
            expect(spans.length).to.equal(3);

            const entryInClient = verifyRootHttpEntry({
              spans,
              host: `localhost:${clientControls.getPort()}`,
              url: '/fetch-deferred'
            });

            verifyHttpExit({
              spans,
              parent: entryInClient,
              url: `http://127.0.0.1:${globalAgent.instance.agentPort}/ping`,
              params: 'k=1'
            });

            verifyHttpExit({
              spans,
              parent: entryInClient,
              url: `http://127.0.0.1:${globalAgent.instance.agentPort}/ping`,
              params: 'k=2'
            });
          });
        });
      });
  });

  describe('capture attributes from different resource types', () => {
    ['string', 'url-object', 'custom-with-stringifier', 'request-object'].forEach(resourceType => {
      [false, true].forEach(withOptions => {
        ['GET', 'POST', 'PUT'].forEach(method => {
          let methodInRequestObject;
          let methodInOptions;
          if (method !== 'GET') {
            if (resourceType === 'request-object') {
              methodInRequestObject = method;
            } else if (withOptions) {
              methodInOptions = method;
            } else {
              return;
            }
          }

          let methodViaLabel = '';
          if (methodInRequestObject || methodInOptions) {
            if (methodInRequestObject) {
              methodViaLabel += `, request object: ${methodInRequestObject}`;
            } else if (methodInOptions) {
              methodViaLabel += `, options: ${methodInOptions}`;
            } else {
              throw new Error('Invalid configuration for this test.');
            }
          }

          const label = `must trace fetch(${resourceType}${
            withOptions ? ', options' : ''
          }) (${method}${methodViaLabel})`;

          it(label, async () => {
            const response = await clientControls.sendRequest({
              path: constructPath({
                basePath: '/fetch',
                resourceType,
                withOptions,
                methodInRequestObject,
                methodInOptions
              })
            });
            verifyResponse(response, method);
            await retry(async () => {
              const spans = await globalAgent.instance.getSpans();
              verifySpans({
                spans,
                method,
                serverControls,
                clientControls
              });
            });
          });
        });
      });

      describe(`capture query params from ${resourceType}`, () => {
        it(`must capture query parameters from a ${resourceType}`, async () => {
          const response = await clientControls.sendRequest({
            path: constructPath({
              basePath: '/fetch',
              resourceType,
              withQuery: true
            })
          });
          verifyResponse(response);
          await retry(async () => {
            const spans = await globalAgent.instance.getSpans();
            verifySpans({
              spans,
              withQuery: true,
              serverControls,
              clientControls
            });
          });
        });
      });
    });
  });

  describe('conflicting HTTP methods', () => {
    it(
      'must trace fetch(request-object, options) and the HTTP method from options must take precedence over the ' +
        'Request object',
      async () => {
        const response = await clientControls.sendRequest({
          path: constructPath({
            basePath: '/fetch',
            resourceType: 'request-object',
            withOptions: true,
            methodInRequestObject: 'DELETE',
            methodInOptions: 'PATCH'
          })
        });
        verifyResponse(response, 'PATCH');
        await retry(async () => {
          const spans = await globalAgent.instance.getSpans();
          verifySpans({
            spans,
            method: 'PATCH',
            withQuery: false,
            serverControls,
            clientControls
          });
        });
      }
    );
  });

  describe('capture HTTP headers', () => {
    it('must capture request headers from the Request object when provided as an object literal', async () => {
      const response = await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'request-object',
          headersInRequestObject: 'literal'
        })
      });
      verifyResponse(response, 'GET', {
        'x-my-exit-request-object-request-header': 'x-my-exit-request-object-request-header-value',
        'x-my-exit-request-object-request-multi-header':
          'x-my-exit-request-object-request-multi-header-value-1,x-my-exit-request-object-request-multi-header-value-2',
        'x-exit-not-captured-header': 'whatever'
      });
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          expectedHeadersOnExitSpan: {
            'x-my-exit-request-object-request-header': 'x-my-exit-request-object-request-header-value',
            'x-my-exit-request-object-request-multi-header':
              'x-my-exit-request-object-request-multi-header-value-1,' +
              'x-my-exit-request-object-request-multi-header-value-2'
          },
          serverControls,
          clientControls
        });
      });
    });

    it('must capture request headers from the Request object when provided as a Fetch API Headers object', async () => {
      const response = await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'request-object',
          headersInRequestObject: 'headers-object'
        })
      });
      verifyResponse(response, 'GET', {
        'x-my-exit-request-object-request-header': 'x-my-exit-request-object-request-header-value',
        'x-my-exit-request-object-request-multi-header':
          'x-my-exit-request-object-request-multi-header-value-1, ' +
          'x-my-exit-request-object-request-multi-header-value-2',
        'x-exit-not-captured-header': 'whatever'
      });
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          expectedHeadersOnExitSpan: {
            'x-my-exit-request-object-request-header': 'x-my-exit-request-object-request-header-value',
            'x-my-exit-request-object-request-multi-header':
              'x-my-exit-request-object-request-multi-header-value-1, ' +
              'x-my-exit-request-object-request-multi-header-value-2'
          },
          serverControls,
          clientControls
        });
      });
    });

    it('must capture request headers from the options object when provided as an object literal', async () => {
      const response = await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'string',
          withOptions: true,
          headersInOptions: 'literal'
        })
      });
      verifyResponse(response, 'GET', {
        'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
        'x-my-exit-options-request-multi-header':
          'x-my-exit-options-request-multi-header-value-1,x-my-exit-options-request-multi-header-value-2',
        'x-exit-not-captured-header': 'whatever'
      });
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          expectedHeadersOnExitSpan: {
            'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
            'x-my-exit-options-request-multi-header':
              'x-my-exit-options-request-multi-header-value-1, x-my-exit-options-request-multi-header-value-2'
          },
          serverControls,
          clientControls
        });
      });
    });

    it('must capture request headers from the options object when provided as a Fetch API Headers object', async () => {
      const response = await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'string',
          withOptions: true,
          headersInOptions: 'headers-object'
        })
      });
      verifyResponse(response, 'GET', {
        'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
        'x-my-exit-options-request-multi-header':
          'x-my-exit-options-request-multi-header-value-1,x-my-exit-options-request-multi-header-value-2',
        'x-exit-not-captured-header': 'whatever'
      });
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          expectedHeadersOnExitSpan: {
            'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
            'x-my-exit-options-request-multi-header':
              'x-my-exit-options-request-multi-header-value-1,x-my-exit-options-request-multi-header-value-2'
          },
          serverControls,
          clientControls
        });
      });
    });

    it('must capture response headers', async () => {
      const response = await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'request-object',
          headersInResponse: true
        })
      });
      verifyResponse(response);
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          expectedHeadersOnExitSpan: {
            'x-my-exit-response-header': 'x-my-exit-response-header-value'
          },
          serverControls,
          clientControls
        });
      });
    });

    it('must merge request and response headers', async () => {
      const response = await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'request-object',
          headersInRequestObject: 'literal',
          headersInResponse: true
        })
      });
      verifyResponse(response, 'GET', {
        'x-my-exit-request-object-request-header': 'x-my-exit-request-object-request-header-value',
        'x-my-exit-request-object-request-multi-header':
          'x-my-exit-request-object-request-multi-header-value-1,x-my-exit-request-object-request-multi-header-value-2',
        'x-exit-not-captured-header': 'whatever'
      });
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          expectedHeadersOnExitSpan: {
            'x-my-exit-request-object-request-header': 'x-my-exit-request-object-request-header-value',
            'x-my-exit-request-object-request-multi-header':
              'x-my-exit-request-object-request-multi-header-value-1,' +
              'x-my-exit-request-object-request-multi-header-value-2',
            'x-my-exit-response-header': 'x-my-exit-response-header-value'
          },
          serverControls,
          clientControls
        });
      });
    });

    it(
      'must capture headers from the Request object and from the options object, and the headers from the options ' +
        'object must take precedence over the Request object',
      async () => {
        const response = await clientControls.sendRequest({
          path: constructPath({
            basePath: '/fetch',
            resourceType: 'request-object',
            withOptions: true,
            headersInRequestObject: 'literal',
            headersInOptions: 'literal'
          })
        });
        verifyResponse(response, 'GET', {
          'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
          'x-my-exit-options-request-multi-header':
            'x-my-exit-options-request-multi-header-value-1,x-my-exit-options-request-multi-header-value-2',
          'x-exit-not-captured-header': 'whatever'
        });
        await retry(async () => {
          const spans = await globalAgent.instance.getSpans();
          verifySpans({
            spans,
            expectedHeadersOnExitSpan: {
              'x-my-exit-options-request-header': 'x-my-exit-options-request-header-value',
              'x-my-exit-options-request-multi-header':
                'x-my-exit-options-request-multi-header-value-1, x-my-exit-options-request-multi-header-value-2'
            },
            serverControls,
            clientControls
          });
        });
      }
    );
  });

  describe('capture errors', () => {
    it('must capture a client-side error', async () => {
      await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'string',
          withClientError: 'unreachable'
        }),
        simple: false
      });

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          withClientError: 'unreachable',
          serverControls,
          clientControls
        });
      });
    });

    it('must capture a synchronous client-side error(malformed-url)', async () => {
      await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'string',
          withClientError: 'malformed-url'
        }),
        simple: false
      });
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          withClientError: 'malformed-url',
          serverControls,
          clientControls
        });
      });
    });

    it('must capture a server-side error', async () => {
      const response = await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'string',
          withServerError: true
        }),
        simple: false
      });
      verifyResponse(response);
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          withServerError: true,
          serverControls,
          clientControls
        });
      });
    });

    it('must handle a client-side timeout', async () => {
      await clientControls.sendRequest({
        path: constructPath({
          basePath: '/fetch',
          resourceType: 'string',
          withOptions: true,
          withTimeout: true
        }),
        simple: false
      });
      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        verifySpans({
          spans,
          withTimeout: true,
          serverControls,
          clientControls
        });
      });
    });
  });

  describe('Allow Root Exit Span Case 1', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        dirname: __dirname,
        appName: 'allowRootExitSpanApp',
        useGlobalAgent: true,
        env: {
          ...commonEnv,
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

  describe('Allow Root Exit Span Case 2', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        dirname: __dirname,
        appName: 'allowRootExitSpanApp',
        useGlobalAgent: true,
        env: {
          ...commonEnv,
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

  describe('when endpoints are configured to be ignored', () => {
    let customServerControls;
    let customClientControls;

    before(async () => {
      customServerControls = new ProcessControls({
        dirname: __dirname,
        appName: 'serverApp',
        useGlobalAgent: true
      });

      customClientControls = new ProcessControls({
        dirname: __dirname,
        appName: 'clientApp',
        useGlobalAgent: true,
        env: {
          ...commonEnv,
          SERVER_PORT: customServerControls.port,
          INSTANA_IGNORE_ENDPOINTS_PATH: require.resolve('./files/tracing.yaml')
        }
      });

      await customServerControls.startAndWaitForAgentConnection();
      await customClientControls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await customClientControls.stop();
      await customServerControls.stop();
    });

    beforeEach(() => globalAgent.instance.clearReceivedTraceData());

    it('should not record spans', async () => {
      await customClientControls.sendRequest({ method: 'GET', path: '/' });

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans).to.have.lengthOf(0);
      });
    });

    it('should not record downstream calls', async () => {
      await customClientControls.sendRequest({ method: 'GET', path: '/downstream-call' });

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans).to.have.lengthOf(0);
      });
    });
  });

  it('must suppress tracing ', async () => {
    const response = await clientControls.sendRequest({
      path: constructPath({}),
      suppressTracing: true
    });
    verifyResponse(response);
    await delay(500);
    const spans = await globalAgent.instance.getSpans();
    expect(spans).to.have.lengthOf(0);
  });

  it('must not discard headers', async function () {
    const isThisANodeJsVersionWhereNativeFetchHeaderHandlingIsBroken =
      instrumentation.shouldAddHeadersToOptionsUnconditionally();

    if (isThisANodeJsVersionWhereNativeFetchHeaderHandlingIsBroken) {
      return this.skip();
    }

    const response = await clientControls.sendRequest({
      path: constructPath({
        resourceType: 'request-object',
        headersInRequestObject: 'literal',
        withOptions: true
      })
    });
    verifyResponse(response, 'GET', {
      'x-my-exit-request-object-request-header': 'x-my-exit-request-object-request-header-value',
      'x-my-exit-request-object-request-multi-header':
        'x-my-exit-request-object-request-multi-header-value-1,x-my-exit-request-object-request-multi-header-value-2',
      'x-exit-not-captured-header': 'whatever'
    });
  });

  function constructPath({
    basePath = '/fetch',
    resourceType = 'string',
    withOptions = false,
    methodInRequestObject = false,
    methodInOptions = false,
    headersInRequestObject = null,
    headersInOptions = null,
    headersInResponse = false,
    withQuery = false,
    withClientError = false,
    withServerError = false,
    withTimeout = false
  }) {
    const testOptionsQuery = {
      resourceType,
      withOptions,
      withQuery,
      headersInRequestObject,
      headersInOptions,
      headersInResponse,
      withClientError,
      withServerError,
      withTimeout
    };
    if (methodInRequestObject) {
      testOptionsQuery.methodInRequestObject = methodInRequestObject;
    }
    if (methodInOptions) {
      testOptionsQuery.methodInOptions = methodInOptions;
    }

    const queryString = Object.keys(testOptionsQuery)
      .map(k => `${k}=${testOptionsQuery[k]}`)
      .join('&');
    return `${basePath}?${queryString}`;
  }

  function verifyResponse(response, expectedMethod = 'GET', expectedHeaders = null) {
    response = JSON.parse(response);
    expect(response.method).to.equal(expectedMethod);
    expect(response.headers).to.be.an('object');
    if (expectedHeaders) {
      Object.keys(expectedHeaders).forEach(key => {
        expect(response.headers[key], `header ${key} was missing in downstream request`).to.exist;
        expect(response.headers[key], `value for header ${key} was wrong in downstream request`).to.equal(
          expectedHeaders[key]
        );
      });
    }
  }

  function verifySpans({
    spans,
    clientEndpoint = '/fetch',
    serverEndpoint = '/fetch',
    method,
    withQuery = false,
    expectedHeadersOnExitSpan = null,
    withClientError = null,
    withServerError = false,
    withTimeout = false
  }) {
    let expectedRootHttpEntryStatusCode = 200;
    if (withClientError || withTimeout) {
      expectedRootHttpEntryStatusCode = 503;
    } else if (withServerError) {
      expectedRootHttpEntryStatusCode = 500;
    }
    const entryInClient = verifyRootHttpEntry({
      spans,
      host: `localhost:${clientControls.getPort()}`,
      url: clientEndpoint,
      status: expectedRootHttpEntryStatusCode,
      withError: withClientError || withServerError || withTimeout
    });

    let expectedUrlInHttpExit = serverUrl(serverEndpoint);
    if (withClientError === 'unreachable') {
      expectedUrlInHttpExit = 'http://localhost:1023/unreachable';
    } else if (withClientError === 'malformed-url') {
      expectedUrlInHttpExit = `http:127.0.0.1:${serverControls.port}malformed-url`;
    }
    const exitInClient = verifyHttpExit({
      spans,
      parent: entryInClient,
      url: expectedUrlInHttpExit,
      status: withServerError ? 500 : 200,
      method,
      withClientError,
      withServerError,
      withTimeout,
      serverControls
    });
    checkQuery({
      span: exitInClient,
      withQuery,
      doNotCheckQuery: withServerError || withTimeout || expectedHeadersOnExitSpan
    });
    checkHeaders(exitInClient, expectedHeadersOnExitSpan);

    if (!withClientError) {
      const entryInServer = verifyHttpEntry({
        spans,
        parent: exitInClient,
        host: `localhost:${serverControls.getPort()}`,
        url: serverEndpoint,
        status: withServerError ? 500 : 200,
        method,
        withError: withServerError,
        abortedByClient: withTimeout
      });
      checkQuery({
        span: entryInServer,
        withQuery,
        doNotCheckQuery: withServerError || withTimeout || expectedHeadersOnExitSpan
      });
      expect(spans).to.have.lengthOf(3);
    } else {
      expect(spans).to.have.lengthOf(2);
    }
  }

  function verifyRootHttpEntry({ spans, host, url = '/', method = 'GET', withError, status = 200 }) {
    return verifyHttpEntry({ spans, parent: null, host, url, method, withError, status });
  }

  function verifyHttpEntry({
    spans,
    parent,
    host,
    url = '/',
    method = 'GET',
    status = 200,
    withError,
    abortedByClient
  }) {
    let expectations = [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.data.http.url).to.equal(url),
      span => expect(span.data.http.method).to.equal(method),
      span => expect(span.data.http.host).to.equal(host),
      span => expect(span.ec).to.equal(withError ? 1 : 0),
      span => expect(span.sy).to.not.exist
    ];
    if (abortedByClient) {
      expectations.push(span => expect(span.data.http.status).to.not.exist);
    } else {
      expectations.push(span => expect(span.data.http.status).to.equal(status));
    }

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
    return expectExactlyOneMatching(spans, expectations);
  }

  function verifyHttpExit({
    spans,
    parent,
    url = '/',
    method = 'GET',
    status = 200,
    withClientError,
    withServerError,
    withTimeout,
    params = null
  }) {
    const expectations = [
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.s).to.be.a('string'),
      span => expect(span.ec).to.equal(withClientError || withServerError || withTimeout ? 1 : 0),
      span => expect(span.data.http.url).to.equal(url),
      span => expect(span.data.http.method).to.equal(method),
      span => (params ? expect(span.data.http.params).to.equal(params) : true),
      span => expect(span.sy).to.not.exist
    ];
    if (withClientError) {
      let expectedClientError;
      if (withClientError === 'unreachable') {
        expectedClientError = 'ECONNREFUSED';
      } else if (withClientError === 'malformed-url') {
        expectedClientError = 'TypeError: Invalid URL';
      }
      expectations.push(span => expect(span.data.http.status).to.not.exist);
      expectations.push(span => expect(span.data.http.error).to.contain(expectedClientError));
    } else if (withTimeout) {
      expectations.push(span => expect(span.data.http.status).to.not.exist);
      expectations.push(span => expect(span.data.http.error).to.contain('The operation was aborted due to timeout'));
    } else {
      expectations.push(span => expect(span.data.http.status).to.equal(status));
      expectations.push(span => expect(span.data.http.error).to.not.exist);
    }
    return expectExactlyOneMatching(spans, expectations);
  }

  function serverUrl(path_) {
    return `http://localhost:${serverControls.getPort()}${path_}`;
  }

  function checkQuery({ span, withQuery, doNotCheckQuery }) {
    if (withQuery) {
      expect(span.data.http.params).to.equal('q1=some&pass=<redacted>&q2=value');
    } else if (doNotCheckQuery) {
      // noop
    } else {
      expect(span.data.http.params).to.not.exist;
    }
  }

  function checkHeaders(span, expectedHeadersOnExitSpan) {
    if (expectedHeadersOnExitSpan) {
      expect(span.data.http.header).to.deep.equal(expectedHeadersOnExitSpan);
    } else {
      expect(span.data.http.header).to.not.exist;
    }
  }
};
