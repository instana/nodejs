/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

exports.payloadPrefix = 'http';
exports.currentPayload = {};

exports.activate = function activate() {};
exports.deactivate = function deactivate() {};

instrumentHttpModule('http');
instrumentHttpModule('https');

function instrumentHttpModule(httpModuleName) {
  const coreHttpModule = require(httpModuleName);
  const originalCreateServer = coreHttpModule.createServer;

  coreHttpModule.createServer = function createServer() {
    const server = originalCreateServer.apply(coreHttpModule, arguments);
    const payloadContext = {
      type: httpModuleName
    };
    let key;

    server.on('listening', () => {
      payloadContext.address = server.address();
      key = payloadContext.address.address + payloadContext.address.port;
      exports.currentPayload[key] = payloadContext;
    });

    server.on('close', () => {
      delete exports.currentPayload[key];
    });

    return server;
  };
}
