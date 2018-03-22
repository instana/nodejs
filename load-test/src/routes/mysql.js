'use strict';

var config = require('../config');
var mysql = require('mysql2/promise');

var connection;
exports.path = '/mysql';

var fetchData = exports.fetchData = function() {
  return query('SELECT * FROM %TABLE%');
};

exports.router = function StandardRoute(res) {
  fetchData()
      .then(function(rows) {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(rows));
      }).catch(function() {
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end('Error while trying to read from MySql');
    });
};

exports.connect = function() {
  return new Promise(function(resolve, reject) {
    mysql.createConnection({
      host: config.services.mysql.url,
      user: config.services.mysql.user,
      database: config.services.mysql.database,
      password: config.services.mysql.password
    }).then(function(con) {
      connection = con;
      resolve();
    }).catch(function() {
      reject('Connection to MySql was not successful.');
    });
  });
};

exports.init = function() {
  return new Promise(function(resolve, reject) {
  if (connection == null) {
    return Promise.reject('MySql Connection has not yet been setup.');
  }
    query('Drop TABLE IF EXISTS %TABLE%')
      .then(query('CREATE TABLE %TABLE% (' +
        ' someNumber int,' +
        ' someString varchar(255),' +
        ' someOtherString varchar(255)' +
        ')'))
      .then(query('INSERT INTO %TABLE%' +
                    '(someNumber, someString, someOtherString) ' +
                  'VALUES ' +
                    '(0, "someString", "someOtherString")'
      )).then(function() {
        resolve();
      }).catch(function() {
        reject('Could not initialise MySql');
    });
  });
};

function query(que) {
  var q = que.replace('%DB%', config.services.mysql.database)
    .replace('%TABLE%', config.services.mysql.table);
  return connection.query(q);
}
