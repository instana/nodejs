'use strict';

const http = require('http');
const proxy = require('proxy');
const basicAuthParser = require('basic-auth-parser');

const sendToParent = require('../../../serverless/test/util/send_to_parent');
const log = require('../../../serverless/test/util/log')(`proxy (${process.pid})`);

const port = process.env.PROXY_PORT || 3128;

const httpServer = http.createServer();

if (process.env.PROXY_REQUIRES_AUTHORIZATION) {
  httpServer.authenticate = (req, fn) => {
    const proxyAuth = req.headers['proxy-authorization'];
    if (!proxyAuth) {
      return fn(null, false);
    }
    const parsed = basicAuthParser(proxyAuth);
    return fn(null, parsed.username === 'user' && parsed.password === 'password');
  };
}

const proxyServer = proxy(httpServer);

proxyServer.listen(port, () => {
  sendToParent('proxy: started');
  log(`HTTP(s) proxy server listening on port ${proxyServer.address().port}.`);
});
