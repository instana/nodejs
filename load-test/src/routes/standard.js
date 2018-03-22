'use strict';

exports.path = '/';

exports.router = function StandardRoute(res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Instana Load Test');
};

exports.connect = function() {
  return Promise.resolve();
};

exports.init = function() {
  return Promise.resolve();
};
