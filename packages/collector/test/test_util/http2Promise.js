'use strict';

const semver = require('semver');
const fs = require('fs');
const path = require('path');

let http2 = null;
let HTTP2_HEADER_METHOD;
let HTTP2_HEADER_PATH;
let HTTP2_HEADER_STATUS;
let NGHTTP2_CANCEL;

if (semver.gte(process.version, '8.4.0')) {
  http2 = require('http2');
  HTTP2_HEADER_METHOD = http2.constants.HTTP2_HEADER_METHOD;
  HTTP2_HEADER_STATUS = http2.constants.HTTP2_HEADER_STATUS;
  HTTP2_HEADER_PATH = http2.constants.HTTP2_HEADER_PATH;
  NGHTTP2_CANCEL = http2.constants.NGHTTP2_CANCEL;
}

const sslDir = path.join(__dirname, '..', 'apps', 'ssl');
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

exports.request = function request(opts) {
  if (!http2) {
    return Promise.reject(new Error('The http2 module is not available'));
  }

  const { baseUrl, method = 'GET', headers: requestHeader = {}, qs, timeout, suppressTracing } = opts;
  let { path: urlPath = '/' } = opts;

  if (qs && Object.keys(qs).length > 0 && urlPath.indexOf('?') >= 0) {
    return Promise.reject(new Error('Cannot combine opts.qs with an opts.path that already contains a query.'));
  } else if (qs && Object.keys(qs).length > 0) {
    urlPath = `${urlPath}?${Object.keys(qs)
      .map(k => k + '=' + qs[k])
      .join('&')}`;
  }

  if (suppressTracing === true) {
    requestHeader['X-INSTANA-L'] = '0';
  }

  return new Promise((resolve, reject) => {
    let client;
    client = http2.connect(baseUrl, {
      ca: cert
    });

    client.on('error', err => {
      reject(err);
    });

    let responseHasEnded = false;
    client.on('connect', () => {
      const requestOptions = Object.assign({}, requestHeader);
      requestOptions[HTTP2_HEADER_PATH] = urlPath;
      requestOptions[HTTP2_HEADER_METHOD] = method;
      const stream = client.request(requestOptions);

      stream.setEncoding('utf8');

      stream.on('response', responseHeaders => {
        const status = responseHeaders[HTTP2_HEADER_STATUS];

        let responsePayload = '';
        stream.on('data', chunk => {
          responsePayload += chunk;
        });

        stream.on('end', () => {
          responseHasEnded = true;
          client.close();
          if (opts.simple === false) {
            resolve({
              status,
              headers: responseHeaders,
              body: responsePayload
            });
          } else if (status >= 100 && status < 300) {
            resolve({
              status,
              headers: responseHeaders,
              body: responsePayload
            });
          } else if (responsePayload && responsePayload.length > 0) {
            reject(new Error(`Unexpected status code ${status}, response payload: ${responsePayload}.`));
          } else {
            reject(new Error(`Unexpected status code ${status}.`));
          }
        });
      });

      if (timeout) {
        stream.setTimeout(timeout, () => {
          stream.close(NGHTTP2_CANCEL);
          const err = new Error('Client Timeout');
          err.error = { code: 'ESOCKETTIMEDOUT' };
          reject(err);
        });
      }

      stream.on('close', () => {
        if (!responseHasEnded) {
          const err = new Error('Client closed stream without response.');
          err.error = { code: 'ECONNRESET' };
          reject(err);
        }
      });

      stream.end();
    });
  });
};
