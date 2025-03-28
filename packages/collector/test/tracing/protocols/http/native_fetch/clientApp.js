/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/mockRequireExpress');

require('../../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const app = express();
const port = require('../../../../test_util/app-port')();

const serverPort = process.env.SERVER_PORT;

// Note: In the client test app for the Node.js http core module, we use
// const baseUrl = `http://user:password@localhost:${serverPort}`;
// to verify that secrets get redacted from basic auth credentials provided directly in the URL. This is not supported
// in native fetch, attempting to do that results in
// node:internal/deps/undici/undici:14062
// TypeError: Request cannot be constructed from a URL that includes credentials: http://user:password@localhost:3217/..
// Thus, there is nothing to redact for us in the fetch instrumentation (except for query params, of course).

const baseUrl = `http://localhost:${serverPort}`;

const logPrefix = `Native Fetch Client (${process.pid}):\t`;

const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.get('/fetch-deferred', async (req, res) => {
  setTimeout(async () => {
    await fetch('http://example.com?k=2');
  }, 500);

  await fetch('http://example.com?k=1');
  res.sendStatus(200);
});

app.get('/fetch', async (req, res) => {
  const resourceArgument = createResourceArgument(req, '/fetch');
  let response;

  try {
    if (req.query.withOptions === 'true') {
      const options = createOptionsArgument(req);
      response = await fetch(resourceArgument, options);
    } else {
      response = await fetch(resourceArgument);
    }

    const downstreamResponseStatus = response.status;
    res.status(downstreamResponseStatus);
    const downstreamResponsePayload = await response.text();
    if (downstreamResponsePayload) {
      res.send(downstreamResponsePayload);
    } else {
      res.send();
    }
  } catch (e) {
    res.status(503);
    res.send(e.message);
  }
});

class CustomResource {
  constructor(url) {
    this.url = url;
  }

  toString() {
    return this.url;
  }
}

function createResourceArgument(req, urlPath) {
  let pathWithQuery;
  let urlSearchParams;

  if (req.query.withQuery === 'true') {
    urlSearchParams = new URLSearchParams({
      q1: 'some',
      pass: 'verysecret',
      q2: 'value'
    });
    pathWithQuery = `${urlPath}?${urlSearchParams}`;
  } else {
    pathWithQuery = urlPath;
  }

  if (req.query.withServerError === 'true') {
    pathWithQuery += '?withServerError=true';
  } else if (req.query.withTimeout === 'true') {
    pathWithQuery += '?withTimeout=true';
  }
  if (req.query.headersInResponse === 'true') {
    pathWithQuery += '?headersInResponse=true';
  }

  const resourceType = req.query.resourceType || 'string';
  switch (resourceType) {
    case 'string':
      if (req.query.withClientError === 'unreachable') {
        return 'http://localhost:1023/unreachable';
      } else if (req.query.withClientError === 'malformed-url') {
        return `http:127.0.0.1:${serverPort}malformed-url`;
      }
      return `${baseUrl}${pathWithQuery}`;

    case 'url-object':
      // eslint-disable-next-line no-case-declarations
      const urlObject = new URL(urlPath, baseUrl);
      if (req.query.withQuery === 'true') {
        urlObject.search = urlSearchParams;
      }
      return urlObject;

    case 'custom-with-stringifier':
      return new CustomResource(baseUrl + pathWithQuery);

    case 'request-object':
      // eslint-disable-next-line no-case-declarations
      let requestObject;
      if (req.query.methodInRequestObject) {
        requestObject = new Request(baseUrl + pathWithQuery, {
          method: req.query.methodInRequestObject
        });
      } else if (req.query.headersInRequestObject === 'literal') {
        requestObject = new Request(baseUrl + pathWithQuery, {
          headers: {
            'x-mY-exit-rEquest-object-request-HEADER': 'x-my-exit-request-object-request-header-value',
            'x-my-exit-rEquest-object-rEqueSt-multi-header': [
              'x-my-exit-request-object-request-multi-header-value-1',
              'x-my-exit-request-object-request-multi-header-value-2'
            ],
            'x-exit-not-captured-header': 'whatever'
          }
        });
      } else if (req.query.headersInRequestObject === 'headers-object') {
        const headers = new Headers();
        headers.set('x-mY-exit-rEquest-object-request-HEADER', 'x-my-exit-request-object-request-header-value');
        headers.append(
          'x-my-exit-rEquest-object-rEqueSt-multi-header',
          'x-my-exit-request-object-request-multi-header-value-1'
        );
        headers.append(
          'x-my-exit-rEquest-object-rEqueSt-multi-header',
          'x-my-exit-request-object-request-multi-header-value-2'
        );
        headers.set('x-exit-not-captured-header', 'whatever');
        requestObject = new Request(baseUrl + pathWithQuery, {
          headers
        });
      } else {
        requestObject = new Request(baseUrl + pathWithQuery);
      }

      return requestObject;

    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
}

function createOptionsArgument(req) {
  const options = {};
  if (req.query.methodInOptions) {
    options.method = req.query.methodInOptions;
  }

  if (req.query.withTimeout) {
    options.signal = AbortSignal.timeout(500);
  }

  if (req.query.headersInOptions === 'literal') {
    options.headers = {
      'x-mY-exit-oPtions-request-HEADER': 'x-my-exit-options-request-header-value',
      'x-my-exit-oPtions-rEqueSt-multi-header': [
        'x-my-exit-options-request-multi-header-value-1',
        'x-my-exit-options-request-multi-header-value-2'
      ],
      'x-exit-not-captured-header': 'whatever'
    };
  } else if (req.query.headersInOptions === 'headers-object') {
    options.headers = new Headers({
      'x-mY-exit-oPtions-request-HEADER': 'x-my-exit-options-request-header-value',
      'x-my-exit-oPtions-rEqueSt-multi-header': [
        'x-my-exit-options-request-multi-header-value-1',
        'x-my-exit-options-request-multi-header-value-2'
      ],
      'x-exit-not-captured-header': 'whatever'
    });
  }

  return options;
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
