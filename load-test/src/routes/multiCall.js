/* eslint-disable no-console */
'use strict';

var mongo = require('./mongodb');
var mysql = require('./mysql');
var redis = require('./redis');
var https = require('https');

var NUMBER_OF_MONGO_CALLS = 5;
var NUMBER_OF_WEB_CALLS = 5;
var NUMBER_OF_REDIS_CALLS = 10;
var NUMBER_OF_MYSQL_CALLS = 5;

exports.path = '/multi';

exports.router = function StandardRoute(res) {
  Promise.all(new Array(NUMBER_OF_WEB_CALLS).fill(callInstana()))
    .then(function() {
      return Promise.all(new Array(NUMBER_OF_REDIS_CALLS).fill(redis.fetchData()));
    })
    .then(function() {
      return Promise.all(new Array(NUMBER_OF_MYSQL_CALLS).fill(mysql.fetchData()));
    })
    .then(function() {
      return Promise.all(new Array(NUMBER_OF_MONGO_CALLS).fill(mongo.fetchData()));
    })
    .then(function() {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('All good.');
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

function callInstana() {
  return new Promise(function(resolve, reject) {
    var req = https.get('https://instana.com', function(res) {
      res.on('data', function() {
        // without this, end is never being called....?
      });
      res.on('end', function() {
        resolve();
      });
    });
    req.on('error', function() {
      reject('Could not query web page.');
    });
  });
}

