'use strict';

var config = require('../config');
var mysql = require('mysql2/promise');

var pool;
exports.path = '/mysql';

var fetchData = exports.fetchData = function() {
  return pool.getConnection()
    .then(function(connection) {
      return query('SELECT * FROM %TABLE%', connection)
        .then(function(result) {
          connection.release();
          return result;
        });
  });
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
  pool = mysql.createPool({
    connectionLimit: 30,
    host: config.services.mysql.url,
    user: config.services.mysql.user,
    database: config.services.mysql.database,
    password: config.services.mysql.password
  });

  return Promise.resolve();
};

exports.init = function() {
  return new Promise(function(resolve, reject) {
    pool.getConnection()
      .then(function(con) {
        query('Drop TABLE IF EXISTS %TABLE%', con);
        return con;
      })
      .then(function(con) {
        query('CREATE TABLE %TABLE% (' +
        ' someNumber int,' +
        ' someString varchar(255),' +
        ' someOtherString varchar(255)' +
        ')', con);
        return con;
      })
      .then(function(con) {
        query('INSERT INTO %TABLE%' +
          '(someNumber, someString, someOtherString) ' +
          'VALUES ' +
          '(0, "someString", "someOtherString")',
          con
        );
        return con;
      }).then(function(connection) {
        connection.release();
        resolve();
      }).catch(function(err) {
        reject('Could not initialise MySql. ' + err);
    });
  });
};

function query(que, connection) {
  var q = que.replace('%DB%', config.services.mysql.database)
    .replace('%TABLE%', config.services.mysql.table);
  return connection.query(q);
}
