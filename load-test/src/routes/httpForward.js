/* eslint-disable no-console */
'use strict';

var https = require('https');

exports.path = '/httpForward';

exports.router = function StandardRoute(res) {
  // will make http calls in a sequence
  Promise.resolve()
    .then(function() {return callWeb();})
    .then(function() {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('OK.');
    }).catch(function(e) {
      console.error('Error while trying to call multi call', e);
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end('Error doing Multi Call');
    });
};

exports.connect = function() {
  return Promise.resolve();
};

exports.init = function() {
  return Promise.resolve();
};

function callWeb() {
  return new Promise(function(resolve, reject) {
    var req = https.get({
      hostname: 'instana.com',
      path: '/',
      timeout: 3000
    }, function(res) {
      res.on('data', function() {
        // without this, end is never being called....?
      });
      res.on('end', function() {
        resolve();
      });
    });
    req.on('error', function(err) {
      console.error(err);
      reject('Could not query web page.');
    });
  });
}

