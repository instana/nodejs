/* eslint-disable no-console */
'use strict';

var Redis = require('ioredis');
var config = require('../config');
var redis;

var fetchData = exports.fetchData = function fetchData() {
  return redis.pipeline().get('load').get('someOtherLoad').exec();
};


exports.path = '/redis';

exports.router = function StandardRoute(res) {
  fetchData().then(function(result) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(result));
    }).catch(function(err) {
      console.error(err);
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end('Error querying Redis.');
    });
};

exports.connect = function() {
  return new Promise(function(resolve, reject) {
      redis = new Redis('//' + config.services.redis.host);
      redis.on('connect', function() {
        resolve();
      });
      redis.on('error', function(error) {
        redis.disconnect();
        reject('Could not connect to redis.', error);
      });
  });
};

exports.init = function() {
  return new Promise(function(resolve, reject) {
    if (redis == null) {
      reject('Redis has not been setup');
    }
    redis.set('load', 'test');
    redis.set('someOtherLoad', 'someOtherTest');
    resolve();
  });
};
