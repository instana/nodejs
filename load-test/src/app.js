'use strict';

var express = require('express');
var config = require('./config');

exports.init = function init(cb) {
  require('any-promise/register/bluebird');

  var app = express();

  app.get('/', function(req, res) {
    res.send('OK');
  });

  app.use(require('./routes/httpCallSequence'));

  app.listen({
    host: 'localhost',
    port: config.app.httpPort,
    backlog: 8192
  }, cb);
};
