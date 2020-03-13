'use strict';

exports.payloadPrefix = 'http';
exports.currentPayload = {};

exports.activate = function() {};
exports.deactivate = function() {};

instrumentHttpModule('http');
instrumentHttpModule('https');

function instrumentHttpModule(httpModuleName) {
  var coreHttpModule = require(httpModuleName);
  var originalCreateServer = coreHttpModule.createServer;

  coreHttpModule.createServer = function createServer() {
    var server = originalCreateServer.apply(coreHttpModule, arguments);
    var payloadContext = {
      type: httpModuleName
    };
    var key;

    server.on('listening', function() {
      payloadContext.address = server.address();
      key = payloadContext.address.address + payloadContext.address.port;
      exports.currentPayload[key] = payloadContext;
    });

    server.on('close', function() {
      delete exports.currentPayload[key];
    });

    return server;
  };
}
