'use strict';

const http = require('http');
const proxy = require('proxy');
const basicAuthParser = require('basic-auth-parser');

const { sendToParent } = require('../../../core/test/test_util');
const log = require('../../../serverless/test/util/log')(`proxy (${process.pid})`);

const port = process.env.PROXY_PORT;

if (!port) {
  throw new Error(`The environment variable PROXY_PORT needs to be set when starting ${__dirname}.`);
}

const httpServer = http.createServer();

if (process.env.PROXY_REQUIRES_AUTHORIZATION) {
  log('HTTP(s) proxy will require authentication.');
  httpServer.authenticate = (req, fn) => {
    const proxyAuth = req.headers['proxy-authorization'];
    if (!proxyAuth) {
      log('Missing Proxy-Authorization header, request will be rejected.');
      return fn(null, false);
    }
    const parsed = basicAuthParser(proxyAuth);
    const authorized = parsed.username === 'user' && parsed.password === 'password';
    if (!authorized) {
      log('Credentials from Proxy-Authorization header are not valid, request will be rejected.');
    }
    return fn(null, authorized);
  };
}

const proxyServer = proxy(httpServer);

proxyServer.listen(port, () => {
  sendToParent('proxy: started');
  log(`HTTP(s) proxy server listening on port ${proxyServer.address().port}.`);
});
