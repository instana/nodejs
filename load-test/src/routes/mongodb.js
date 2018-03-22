/* eslint-disable no-console */
'use strict';

var config = require('../config');
var mongoose = require('mongoose');

var TestSchema = mongoose.model('test', new mongoose.Schema({
  someString: String,
  someNumber: Number,
  someDate: {type: Date, default: new Date().getTime() },
  someBoolean: Boolean
}));

var fetchData = exports.fetchData = function fetchData() {
  return TestSchema.find().exec();
};

exports.path = '/mongo';

exports.router = function StandardRoute(res) {
  fetchData()
    .then(function(response) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(response[0]));
    }).catch(function(error) {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('An error occured while querying mongodb.');
    console.error(error);
  });
};

exports.connect = function connect() {
  return mongoose.connect('mongodb://' + config.services.mongo.host + '/load');
};

exports.init = function init() {
  return new Promise(function(resolve, reject) {
    var newTestModel = new TestSchema({
      someString: 'Hello',
      someNumber: 123456789,
      someBoolean: true
    });
    Promise.all([TestSchema.remove().exec(), newTestModel.save()])
      .then(resolve)
      .catch(reject);
  });
};
