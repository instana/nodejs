/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const useHttp2 = process.env.USE_HTTP2 ? process.env.USE_HTTP2 === 'true' : false;

require('../../../..')();

const fs = require('fs');
const path = require('path');
const rp = require('request-promise');
const { parse } = require('url');

const http2Promise = require('../../../test_util/http2Promise');

const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = require('http2').constants;

const port = process.env.APP_PORT || 3215;
const downstreamPort = process.env.DOWNSTREAM_PORT || 3216;

const logPrefix = `Spec Compliance Test App (${useHttp2 ? 'HTTP2' : 'HTTP1'}) (${process.pid}):\t`;

if (useHttp2) {
  // HTTP 2

  const http2 = require('http2');

  const sslDir = path.join(__dirname, '..', '..', '..', 'apps', 'ssl');

  const server = http2.createSecureServer({
    key: fs.readFileSync(path.join(sslDir, 'key')),
    cert: fs.readFileSync(path.join(sslDir, 'cert'))
  });

  server.on('error', err => {
    log('HTTP2 server error', err);
  });

  server.on('stream', (stream, headers) => {
    handleRequest(headers, headers[HTTP2_HEADER_METHOD] || 'GET', headers[HTTP2_HEADER_PATH] || '/', stream);
  });

  server.listen(port, () => {
    log(`Listening (HTTP2) on port: ${port}`);
  });
} else {
  // HTTP 1.1

  const server = require('http')
    .createServer()
    .listen(port, () => {
      log(`Listening  on port: ${port}`);
    });

  server.on('request', (req, res) => handleRequest(req.headers, req.method, req.url, res));
}

async function handleRequest(incomingHeaders, method, url, resOrStream) {
  const loggedHeaders = Object.assign({}, incomingHeaders);
  delete loggedHeaders.host;
  delete loggedHeaders.accept;
  delete loggedHeaders.connection;

  if (process.env.WITH_STDOUT) {
    log(`-> ${method} ${url} ${JSON.stringify(loggedHeaders)}`);
  }

  const { pathname, query } = parse(url, true);

  if (pathname === '/') {
    if (method !== 'GET') {
      return endWithStatus(method, url, resOrStream, 405);
    }
    return endWithStatus(method, url, resOrStream, 200);
  } else if (pathname === '/start') {
    if (method !== 'GET') {
      return endWithStatus(method, url, resOrStream, 405);
    }
    const requestOptions = {
      method,
      qs: query
    };
    if (useHttp2) {
      requestOptions.baseUrl = `https://localhost:${downstreamPort}`;
      requestOptions.path = '/downstream';
    } else {
      requestOptions.uri = `http://localhost:${downstreamPort}/downstream`;
    }

    const requestPromise = useHttp2 ? http2Promise.request(requestOptions) : rp(requestOptions);
    try {
      const downstreamResponse = await requestPromise;
      return endWithPayload(method, url, resOrStream, downstreamResponse);
    } catch (e) {
      return endWithError(method, url, resOrStream, e);
    }
  }

  return endWithStatus(method, url, resOrStream, 404);
}

function endWithPayload(method, url, resOrStream, payload) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> 200`);
  }
  if (typeof payload === 'object') {
    payload = JSON.stringify(payload);
  }
  if (useHttp2) {
    resOrStream.respond({
      [HTTP2_HEADER_STATUS]: 200
    });
  } else {
    resOrStream.statusCode = 200;
  }
  resOrStream.end(payload);
}

function endWithError(method, url, resOrStream, error) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> 500 – ${error}`);
  }
  // eslint-disable-next-line no-console
  console.error(error);
  _endWithStatus(method, url, resOrStream, 500);
}

function endWithStatus(method, url, resOrStream, statusCode) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> ${statusCode}`);
  }
  _endWithStatus(method, url, resOrStream, statusCode);
}

function _endWithStatus(method, url, resOrStream, statusCode) {
  if (process.env.WITH_STDOUT) {
    log(`${method} ${url} -> ${statusCode}`);
  }
  if (useHttp2) {
    resOrStream.respond({
      [HTTP2_HEADER_STATUS]: statusCode
    });
  } else {
    resOrStream.statusCode = statusCode;
  }
  resOrStream.end();
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
